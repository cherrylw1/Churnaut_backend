import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { parseAnomalyAggregate } from '@/lib/analytics/anomaly';

export const dynamic = 'force-dynamic';


interface ScoutDealScore {
  deal_id: string;
  deal_name: string | null;
  stage: string | null;
  deal_value: number | null;
  close_date: string | null;
  days_in_stage: number | null;
  last_activity_days: number | null;
  contact_count: number | null;
  website_visits_7d: number | null;
  score: 'RED' | 'AMBER' | 'GREEN' | null;
  primary_risk: string | null;
  next_action: string | null;
  draft_email: string | null;
  rep_name: string | null;
  rep_email: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch latest snapshot (for pressure score and pipeline status)
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('pipeline_snapshots')
      .select('pressure_score')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError) throw snapshotError;

    const pressureScore = snapshot?.pressure_score ?? 0;
    let pipelineStatus = 'HEALTHY';
    if (pressureScore > 30 && pressureScore <= 60) {
      pipelineStatus = 'NEEDS ATTENTION';
    } else if (pressureScore > 60) {
      pipelineStatus = 'AT RISK';
    }

    // 2. Fetch Active Rules count
    const { count: activeRulesCount, error: activeRulesError } = await supabaseAdmin
      .from('routing_rules')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('active', true);

    if (activeRulesError) throw activeRulesError;

    // 3. Fetch Tracked Links count
    const { count: trackedLinksCount, error: trackedLinksError } = await supabaseAdmin
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .or('session_kind.eq.tracked_link,session_kind.is.null');

    if (trackedLinksError) throw trackedLinksError;

    // 4. Fetch Sessions This Week count
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const { data: visitAggregateData, error: visitAggregateError } = await supabaseAdmin.rpc(
      'anomaly_v2_aggregate',
      {
        client_id_input: clientId,
        current_start_input: sevenDaysAgo.toISOString(),
        previous_start_input: fourteenDaysAgo.toISOString(),
        period_end_input: new Date().toISOString(),
      }
    );
    const visitAggregate = parseAnomalyAggregate(visitAggregateData);
    if (visitAggregateError || !visitAggregate) throw visitAggregateError || new Error('Invalid dashboard aggregate');
    const sessionsThisWeek = visitAggregate.current.visitors;

    // 5. Fetch Scout Inbox Details
    const { data: dealScores, error: dealScoresError } = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    if (dealScoresError) throw dealScoresError;

    const typedDeals = (dealScores || []) as unknown as ScoutDealScore[];
    const redDeals = typedDeals.filter((d) => d.score === 'RED');

    // Fetch sessions to map deals to representatives
    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('crm_deal_id, assigned_rep')
      .eq('client_id', clientId)
      .not('crm_deal_id', 'is', null);

    if (sessionsError) throw sessionsError;

    const dealRepMap = new Map<string, string>();
    if (sessionsData) {
      for (const s of sessionsData) {
        if (s.crm_deal_id) {
          dealRepMap.set(s.crm_deal_id, s.assigned_rep || 'Unknown Rep');
        }
      }
    }

    // Determine top RED deal by value
    const sortedRedDeals = [...redDeals].sort(
      (a, b) => (b.deal_value || 0) - (a.deal_value || 0)
    );
    const topRedDeal = sortedRedDeals[0]
      ? {
          deal_name: sortedRedDeals[0].deal_name || 'Unnamed Deal',
          next_action: sortedRedDeals[0].next_action || 'Review status.',
        }
      : null;

    // Determine rep with the most RED deals
    const repCounts: Record<string, number> = {};
    redDeals.forEach((deal) => {
      const rep = deal.rep_name || dealRepMap.get(deal.deal_id) || 'Unknown Rep';
      repCounts[rep] = (repCounts[rep] || 0) + 1;
    });

    let topRepName = '';
    let maxCount = 0;
    for (const [rep, count] of Object.entries(repCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topRepName = rep;
      }
    }
    const topRep = topRepName
      ? {
          rep_name: topRepName,
          count: maxCount,
        }
      : null;

    const scoutInbox = {
      top_red_deal: topRedDeal,
      top_rep: topRep,
      has_red_deals: redDeals.length > 0,
    };

    // 6. Fetch Recent Activity (last 5 analytics events)
    const { data: recentEvents, error: recentEventsError } = await supabaseAdmin
      .from('analytics_events')
      .select('event_type, signal_type, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentEventsError) throw recentEventsError;

    return NextResponse.json({
      pressure_score: pressureScore,
      pipeline_status: pipelineStatus,
      active_rules_count: activeRulesCount || 0,
      tracked_links_count: trackedLinksCount || 0,
      sessions_this_week: sessionsThisWeek || 0,
      scout_inbox: scoutInbox,
      recent_activity: recentEvents || [],
    });
  } catch (error) {
    console.error('[Dashboard Summary GET Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
