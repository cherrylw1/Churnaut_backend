import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchHubSpotPipeline } from '@/lib/integrations/hubspot-pipeline';
import { scoreDealsWithScout } from '@/lib/scout-scoring';

export const dynamic = 'force-dynamic';

function scoredDealsCount(deals: unknown[] | undefined): number {
  return deals ? deals.length : 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'gemini-diagnostics') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientId = 'c8aa7742-287a-40ea-9d5c-064b51a58d9c';
    
    // 1. Fetch HubSpot pipeline deals
    const deals = await fetchHubSpotPipeline(clientId);
    console.log(`[Trigger Score GET] fetchHubSpotPipeline returned ${deals.length} deals`);

    // 2. Score deals using Gemini AI
    const scores = await scoreDealsWithScout(clientId, deals, true);
    console.log('[Trigger Score GET] scoreDealsWithScout output response:', JSON.stringify(scores));

    // If no deals exist, return early
    if (scoredDealsCount(scores.deals) === 0) {
      const { error: snapshotErr } = await supabaseAdmin
        .from('pipeline_snapshots')
        .insert({
          client_id: clientId,
          total_deals: 0,
          red_count: 0,
          amber_count: 0,
          green_count: 0,
          total_pipeline_value: 0,
          pressure_score: 0,
        });

      return NextResponse.json({
        success: true,
        message: 'No deals to score',
        snapshotError: snapshotErr,
      });
    }

    // 3. Map deals and score metrics
    const dealsMap = new Map(deals.map((d) => [d.deal_id, d]));
    const scoredDeals = scores.deals.map((sd) => {
      const rawDeal = dealsMap.get(sd.deal_id);
      return {
        client_id: clientId,
        deal_id: sd.deal_id,
        deal_name: sd.deal_name,
        score: sd.score,
        primary_risk: sd.primary_risk,
        next_action: sd.next_action,
        draft_email: sd.draft_email || null,
        stage: rawDeal?.stage || 'Unknown Stage',
        deal_value: rawDeal?.deal_value || 0,
        close_date: rawDeal?.close_date || null,
        days_in_stage: rawDeal?.days_in_stage || 0,
        last_activity_days: rawDeal?.last_activity_days ?? null,
        contact_count: rawDeal?.contact_count || 0,
        website_visits_7d: rawDeal?.website_visits_7d || 0,
        scored_at: new Date().toISOString(),
      };
    });

    // 4. Save all scored deals to deal_scores table in database
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('deal_scores')
      .select('id, deal_id')
      .eq('client_id', clientId);

    if (existingErr) {
      return NextResponse.json({ error: 'Database error reading existing deal scores', details: existingErr }, { status: 500 });
    }

    const existingMap = new Map(existing?.map((e) => [e.deal_id, e.id]) || []);
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    for (const record of scoredDeals) {
      const existingId = existingMap.get(record.deal_id);
      if (existingId) {
        toUpdate.push({ id: existingId, ...record });
      } else {
        toInsert.push(record);
      }
    }

    console.log('[Trigger Score GET] Starting database writes. toInsert:', JSON.stringify(toInsert, null, 2));
    console.log('[Trigger Score GET] toUpdate:', JSON.stringify(toUpdate, null, 2));

    const insertResponses = [];
    const updateResponses = [];

    // Perform inserts
    if (toInsert.length > 0) {
      console.log('[Trigger Score GET] Executing Supabase insert...');
      const insRes = await supabaseAdmin.from('deal_scores').insert(toInsert);
      console.log('[Trigger Score GET] Supabase insert response:', JSON.stringify(insRes, null, 2));
      insertResponses.push(insRes);
    }

    // Perform updates
    for (const updateRec of toUpdate) {
      console.log(`[Trigger Score GET] Executing Supabase update for deal_id ${updateRec.deal_id}...`);
      const updRes = await supabaseAdmin
        .from('deal_scores')
        .update(updateRec)
        .eq('id', updateRec.id as string);
      console.log(`[Trigger Score GET] Supabase update response for deal_id ${updateRec.deal_id}:`, JSON.stringify(updRes, null, 2));
      updateResponses.push(updRes);
    }

    // 5. Save snapshot to pipeline_snapshots table
    const totalDeals = scoredDeals.length;
    const redCount = scoredDeals.filter((d) => d.score === 'RED').length;
    const amberCount = scoredDeals.filter((d) => d.score === 'AMBER').length;
    const greenCount = scoredDeals.filter((d) => d.score === 'GREEN').length;
    const totalPipelineValue = scoredDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);

    const snapshotRes = await supabaseAdmin
      .from('pipeline_snapshots')
      .insert({
        client_id: clientId,
        total_deals: totalDeals,
        red_count: redCount,
        amber_count: amberCount,
        green_count: greenCount,
        total_pipeline_value: totalPipelineValue,
        pressure_score: scores.pipeline_pressure_score,
      });

    return NextResponse.json({
      success: true,
      toInsert,
      toUpdate,
      insertResponses,
      updateResponses,
      snapshotRes,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    return NextResponse.json({
      success: false,
      error: errMsg,
      stack: errStack,
    }, { status: 500 });
  }
}
