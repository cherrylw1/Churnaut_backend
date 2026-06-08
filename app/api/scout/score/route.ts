import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildNormalizedDeals } from '@/lib/scout/assemble';
import { analyzeDeals } from '@/lib/scout/runner';
import { calculateDealPatterns } from '@/lib/scout-scoring';
import { logLLMCall } from '@/lib/llm/logger';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req);
  const gate = planGate(plan, 'growth');
  if (gate) return gate;

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Assemble normalized deals (CRM + universal + priors)
    const deals = await buildNormalizedDeals(clientId);
    const currentDealIds = deals.map((d) => d.crm.deal_id);

    // 2. Cleanup stale deal_scores (deals no longer in pipeline)
    if (currentDealIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('deal_scores')
        .delete({ count: 'exact' })
        .eq('client_id', clientId)
        .not('deal_id', 'in', `(${currentDealIds.map((id) => `"${id}"`).join(',')})`);
      if (deleteError) { console.error('[Scout Score POST] Stale cleanup error:', deleteError); throw deleteError; }
    }

    // 3. Analyze with the new Scout engine
    const llmStart = Date.now();
    const { pipeline_pressure_score, briefs } = await analyzeDeals(deals);
    const latency = Date.now() - llmStart;

    const dealMap = new Map(deals.map((d) => [d.crm.deal_id, d]));

    briefs.forEach((b) => {
      logLLMCall({
        client_id: clientId,
        deal_id: b.deal_id,
        feature: 'scout_score',
        input_payload: (dealMap.get(b.deal_id) || {}) as unknown as Record<string, unknown>,
        output_payload: b as unknown as Record<string, unknown>,
        latency_ms: latency,
      });
    });

    // Empty pipeline -> empty snapshot + early return
    if (briefs.length === 0) {
      const { error: snapErr } = await supabaseAdmin.from('pipeline_snapshots').insert({
        client_id: clientId, total_deals: 0, red_count: 0, amber_count: 0, green_count: 0,
        total_pipeline_value: 0, pressure_score: 0,
      });
      if (snapErr) console.error('[Scout Score POST] Empty snapshot insert failed:', snapErr);
      return NextResponse.json({ pipeline_pressure_score: 0, deals: [] });
    }

    // 4. Map briefs -> deal_scores rows (existing column shape only)
    const scoredDeals = briefs.map((b) => {
      const crm = dealMap.get(b.deal_id)?.crm;
      const uni = dealMap.get(b.deal_id)?.universal;
      return {
        client_id: clientId,
        deal_id: b.deal_id,
        deal_name: b.deal_name,
        score: b.score,
        primary_risk: b.primary_risk,
        next_action: b.next_action,
        draft_email: b.draft_message || null,
        rep_name: crm?.owner_name || null,
        rep_email: crm?.owner_email || null,
        stage: crm?.stage_raw || crm?.stage_canonical || 'Unknown Stage',
        deal_value: crm?.value || 0,
        close_date: crm?.close_date || null,
        days_in_stage: crm?.days_in_current_stage || 0,
        last_activity_days: crm?.days_since_last_activity ?? null,
        contact_count: crm?.contacts?.length || 0,
        website_visits_7d: uni?.website?.visits_7d || 0,
        confidence: b.confidence,
        reasoning: b.reasoning,
        comparison: b.comparison || null,
        what_would_move_score: b.what_would_move_score || null,
        evidence: b.evidence || [],
        data_gaps: b.data_gaps || [],
        scored_at: new Date().toISOString(),
      };
    });

    // 5. Upsert deal_scores (insert new / update existing), split in JS
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('deal_scores').select('id, deal_id').eq('client_id', clientId);
    if (existingErr) { console.error('[Scout Score POST] Read existing error:', existingErr); throw existingErr; }
    const existingMap = new Map(existing?.map((e) => [e.deal_id, e.id]) || []);
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];
    for (const record of scoredDeals) {
      const existingId = existingMap.get(record.deal_id);
      if (existingId) toUpdate.push({ id: existingId, ...record });
      else toInsert.push(record);
    }
    if (toInsert.length > 0) {
      const insRes = await supabaseAdmin.from('deal_scores').insert(toInsert);
      if (insRes.error) { console.error('[Scout Score POST] Insert error:', insRes.error); throw insRes.error; }
    }
    for (const updateRec of toUpdate) {
      const updRes = await supabaseAdmin.from('deal_scores').update(updateRec).eq('id', updateRec.id as string);
      if (updRes.error) { console.error('[Scout Score POST] Update error:', updRes.error); throw updRes.error; }
    }

    // 5b. Append to score history (append-only; powers score trajectory over time)
    const historyRows = scoredDeals.map((d) => ({
      client_id: clientId,
      deal_id: d.deal_id,
      deal_name: d.deal_name,
      score: d.score,
      confidence: d.confidence,
      scored_at: d.scored_at,
    }));
    const { error: historyErr } = await supabaseAdmin.from('deal_score_history').insert(historyRows);
    if (historyErr) console.error('[Scout Score POST] history insert failed (non-fatal):', historyErr);

    // 6. Pipeline snapshot
    const redCount = scoredDeals.filter((d) => d.score === 'RED').length;
    const amberCount = scoredDeals.filter((d) => d.score === 'AMBER').length;
    const greenCount = scoredDeals.filter((d) => d.score === 'GREEN').length;
    const totalPipelineValue = scoredDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    const { error: snapshotErr } = await supabaseAdmin.from('pipeline_snapshots').insert({
      client_id: clientId, total_deals: scoredDeals.length, red_count: redCount,
      amber_count: amberCount, green_count: greenCount, total_pipeline_value: totalPipelineValue,
      pressure_score: pipeline_pressure_score,
    });
    if (snapshotErr) { console.error('[Scout Score POST] Snapshot error:', snapshotErr); throw snapshotErr; }

    // 7. Keep company_deal_patterns fresh for next run (best-effort)
    try { await calculateDealPatterns(clientId); }
    catch (e) { console.error('[Scout Score POST] calculateDealPatterns failed (non-fatal):', e); }

    return NextResponse.json({ pipeline_pressure_score, deals: scoredDeals });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    const errStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error(`[Scout Score POST Exception] ${errMsg}\nStack:\n${errStack}`);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
