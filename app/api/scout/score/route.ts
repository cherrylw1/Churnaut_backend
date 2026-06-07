import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchHubSpotPipeline, ScoutDeal } from '@/lib/integrations/hubspot-pipeline';
import { scoreDealsWithScout, calculateDealPatterns, ScoutScoreResult } from '@/lib/scout-scoring';
import { logLLMCall } from '@/lib/llm/logger';
import { getClientPlan, planGate } from '@/lib/gate';
import { getVerifiedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate Client
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Scout Score POST] Client lookup successful. client_id:', clientId, 'crm_type: hubspot');

    // 2. Fetch HubSpot pipeline deals
    let deals: ScoutDeal[];
    try {
      deals = await fetchHubSpotPipeline(clientId, true);
      console.log(`[Scout Score POST] fetchHubSpotPipeline returned ${deals.length} deals`);
      console.log('SCOUT PIPELINE DATA:', JSON.stringify(deals, null, 2));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Scout Score POST] Error in fetchHubSpotPipeline:', errMsg);
      throw err;
    }

    // Cleanup step: delete stale deals from deal_scores
    const currentDealIds = deals.map((d) => d.deal_id);
    console.log(`[Scout Score POST] Cleaning up stale deal_scores. Current active deal IDs:`, currentDealIds);
    if (currentDealIds.length > 0) {
      try {
        const { error: deleteError, count: deleteCount } = await supabaseAdmin
          .from('deal_scores')
          .delete({ count: 'exact' })
          .eq('client_id', clientId)
          .not('deal_id', 'in', `(${currentDealIds.map(id => `"${id}"`).join(',')})`);

        console.log('[Scout Score POST] Cleanup result:', { deleteCount, deleteError, currentDealIds });

        if (deleteError) {
          console.error('[Scout Score POST] Error cleaning up stale deal_scores:', deleteError);
          throw deleteError;
        }
        console.log('[Scout Score POST] Stale deal_scores cleanup completed successfully');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[Scout Score POST] Failed during deal_scores cleanup:', errMsg);
        throw err;
      }
    } else {
      console.log('[Scout Score POST] Skipping cleanup delete because currentDealIds is empty');
    }

    // 3. Score deals using Gemini AI
    let scores: ScoutScoreResult;
    try {
      const llmStart = Date.now();
      scores = await scoreDealsWithScout(clientId, deals, true);
      const latency = Date.now() - llmStart;
      console.log('[Scout Score POST] scoreDealsWithScout output response:', JSON.stringify(scores));

      if (scores && Array.isArray(scores.deals)) {
        scores.deals.forEach((sd) => {
          const rawDeal = deals.find((d) => d.deal_id === sd.deal_id);
          logLLMCall({
            client_id: clientId,
            deal_id: sd.deal_id,
            feature: 'scout_score',
            input_payload: (rawDeal || {}) as unknown as Record<string, unknown>,
            output_payload: sd as unknown as Record<string, unknown>,
            latency_ms: latency,
          });
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Scout Score POST] Error in scoreDealsWithScout:', errMsg);
      throw err;
    }

    const dealsMap = new Map(deals.map((d) => [d.deal_id, d]));

    // Helper to map and save scores/snapshots to database
    const saveScoresToDb = async (currentScores: typeof scores) => {
      if (scoredDealsCount(currentScores.deals) === 0) {
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

        if (snapshotErr) {
          console.error('[Scout Score POST] Failed to insert empty snapshot:', snapshotErr);
        }
        return { scoredDeals: [] };
      }

      const scoredDeals = currentScores.deals.map((sd) => {
        const rawDeal = dealsMap.get(sd.deal_id);
        return {
          client_id: clientId,
          deal_id: sd.deal_id,
          deal_name: sd.deal_name,
          score: sd.score,
          primary_risk: sd.primary_risk,
          next_action: sd.next_action,
          draft_email: sd.draft_email || null,
          rep_name: rawDeal?.rep_name || null,
          rep_email: rawDeal?.rep_email || null,
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

      // Save all scored deals to deal_scores table in database (split upsert in JS)
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from('deal_scores')
        .select('id, deal_id')
        .eq('client_id', clientId);

      if (existingErr) {
        console.error('[Scout Score POST] Error reading existing deal_scores:', existingErr);
        throw existingErr;
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

      console.log('[Scout Score POST] Starting database writes. toInsert:', JSON.stringify(toInsert, null, 2));
      console.log('[Scout Score POST] toUpdate:', JSON.stringify(toUpdate, null, 2));

      // Perform inserts
      if (toInsert.length > 0) {
        console.log('[Scout Score POST] Executing Supabase insert for toInsert...');
        const insRes = await supabaseAdmin.from('deal_scores').insert(toInsert);
        console.log('[Scout Score POST] Supabase insert response:', JSON.stringify(insRes, null, 2));
        if (insRes.error) {
          console.error('[Scout Score POST] Error inserting deal_scores:', insRes.error);
          throw insRes.error;
        }
      }

      // Perform updates
      for (const updateRec of toUpdate) {
        console.log(`[Scout Score POST] Executing Supabase update for deal_id ${updateRec.deal_id}...`);
        const updRes = await supabaseAdmin
          .from('deal_scores')
          .update(updateRec)
          .eq('id', updateRec.id as string);
        console.log(`[Scout Score POST] Supabase update response for deal_id ${updateRec.deal_id}:`, JSON.stringify(updRes, null, 2));
        if (updRes.error) {
          console.error('[Scout Score POST] Error updating deal_scores:', updRes.error);
          throw updRes.error;
        }
      }

      // Save snapshot to pipeline_snapshots table
      const totalDeals = scoredDeals.length;
      const redCount = scoredDeals.filter((d) => d.score === 'RED').length;
      const amberCount = scoredDeals.filter((d) => d.score === 'AMBER').length;
      const greenCount = scoredDeals.filter((d) => d.score === 'GREEN').length;
      const totalPipelineValue = scoredDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);

      const { error: snapshotErr } = await supabaseAdmin
        .from('pipeline_snapshots')
        .insert({
          client_id: clientId,
          total_deals: totalDeals,
          red_count: redCount,
          amber_count: amberCount,
          green_count: greenCount,
          total_pipeline_value: totalPipelineValue,
          pressure_score: currentScores.pipeline_pressure_score,
        });

      if (snapshotErr) {
        console.error('[Scout Score POST] Error saving pipeline snapshot:', snapshotErr);
        throw snapshotErr;
      }

      return { scoredDeals };
    };

    // First DB save (to ensure historical data has current run results)
    let saveResult = await saveScoresToDb(scores);

    // If no deals exist, return early
    if (scoredDealsCount(scores.deals) === 0) {
      return NextResponse.json({
        pipeline_pressure_score: 0,
        deals: [],
      });
    }

    // Call calculateDealPatterns
    const patterns = await calculateDealPatterns(clientId);

    // If patterns exist, re-run scoring with enriched prompt
    if (patterns) {
      console.log('[Scout Score POST] Re-running scoring with enriched patterns:', JSON.stringify(patterns));
      try {
        const llmStart = Date.now();
        scores = await scoreDealsWithScout(clientId, deals, true, patterns);
        const latency = Date.now() - llmStart;
        console.log('[Scout Score POST] Enriched scoreDealsWithScout response:', JSON.stringify(scores));

        if (scores && Array.isArray(scores.deals)) {
          scores.deals.forEach((sd) => {
            const rawDeal = deals.find((d) => d.deal_id === sd.deal_id);
            logLLMCall({
              client_id: clientId,
              deal_id: sd.deal_id,
              feature: 'scout_score',
              input_payload: { deal: rawDeal || {}, patterns } as unknown as Record<string, unknown>,
              output_payload: sd as unknown as Record<string, unknown>,
              latency_ms: latency,
            });
          });
        }

        // Overwrite DB saves with the enriched scores
        saveResult = await saveScoresToDb(scores);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[Scout Score POST] Error in enriched scoreDealsWithScout, falling back to initial scores:', errMsg);
      }
    }

    // Return the full scored pipeline with pressure score
    return NextResponse.json({
      pipeline_pressure_score: scores.pipeline_pressure_score,
      deals: saveResult?.scoredDeals || [],
    });

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error(`[Scout Score POST Exception] Unhandled error: ${errMessage}\nStack trace:\n${errStack}`);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// Inline helper to safety check scored deals count
function scoredDealsCount(deals: unknown[] | undefined): number {
  return deals ? deals.length : 0;
}
