import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchHubSpotPipeline } from '@/lib/integrations/hubspot-pipeline';
import { scoreDealsWithScout } from '@/lib/scout-scoring';

export const dynamic = 'force-dynamic';

// Helper to extract authenticated client_id from cookie session
function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Scout Score POST] Client lookup successful. client_id:', clientId, 'crm_type: hubspot');

    // 2. Fetch HubSpot pipeline deals
    let deals;
    try {
      deals = await fetchHubSpotPipeline(clientId);
      console.log(`[Scout Score POST] fetchHubSpotPipeline returned ${deals.length} deals`);
      console.log('SCOUT PIPELINE DATA:', JSON.stringify(deals, null, 2));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Scout Score POST] Error in fetchHubSpotPipeline:', errMsg);
      throw err;
    }

    // 3. Score deals using Gemini AI
    let scores;
    try {
      scores = await scoreDealsWithScout(clientId, deals);
      console.log('[Scout Score POST] scoreDealsWithScout output response:', JSON.stringify(scores));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Scout Score POST] Error in scoreDealsWithScout:', errMsg);
      throw err;
    }

    // If no deals exist, return early
    if (scoredDealsCount(scores.deals) === 0) {
      // Create a snapshot for empty pipeline
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

      return NextResponse.json({
        pipeline_pressure_score: 0,
        deals: [],
      });
    }

    // 4. Map deals and score metrics to combine HubSpot fields and Gemini scores
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

    // 5. Save all scored deals to deal_scores table in database (split upsert in JS)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('deal_scores')
      .select('id, deal_id')
      .eq('client_id', clientId);

    if (existingErr) {
      console.error('[Scout Score POST] Error reading existing deal_scores:', existingErr);
      return NextResponse.json({ error: 'Database error reading deal scores' }, { status: 500 });
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

    // Perform inserts
    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('deal_scores').insert(toInsert);
      if (insErr) {
        console.error('[Scout Score POST] Error inserting deal_scores:', insErr);
        return NextResponse.json({ error: 'Database error saving deal scores' }, { status: 500 });
      }
    }

    // Perform updates
    for (const updateRec of toUpdate) {
      const { error: updErr } = await supabaseAdmin
        .from('deal_scores')
        .update(updateRec)
        .eq('id', updateRec.id as string);
      if (updErr) {
        console.error('[Scout Score POST] Error updating deal_scores:', updErr);
        return NextResponse.json({ error: 'Database error updating deal scores' }, { status: 500 });
      }
    }

    // 6. Save snapshot to pipeline_snapshots table
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
        pressure_score: scores.pipeline_pressure_score,
      });

    if (snapshotErr) {
      console.error('[Scout Score POST] Error saving pipeline snapshot:', snapshotErr);
      return NextResponse.json({ error: 'Database error saving pipeline snapshot' }, { status: 500 });
    }

    // 7. Return the full scored pipeline with pressure score
    return NextResponse.json({
      pipeline_pressure_score: scores.pipeline_pressure_score,
      deals: scoredDeals,
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
