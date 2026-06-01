import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'gemini-diagnostics') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientId = 'c8aa7742-287a-40ea-9d5c-064b51a58d9c';
    console.log('[Trigger Pipeline GET] Querying for client ID:', clientId);

    // 1. Fetch the latest snapshot for this client
    console.log('[Trigger Pipeline GET] Fetching latest snapshot...');
    const snapshotRes = await supabaseAdmin
      .from('pipeline_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[Trigger Pipeline GET] Raw snapshot query response:', JSON.stringify(snapshotRes, null, 2));
    const { data: latestSnapshot, error: snapshotError } = snapshotRes;

    if (snapshotError) {
      return NextResponse.json({ error: 'Database error fetching pipeline snapshot', details: snapshotError }, { status: 500 });
    }

    // 2. Fetch deal scores for this client
    console.log('[Trigger Pipeline GET] Fetching deal scores...');
    const dealScoresRes = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    console.log('[Trigger Pipeline GET] Raw deal scores query response:', JSON.stringify(dealScoresRes, null, 2));
    const { data: dealScores, error: scoresError } = dealScoresRes;

    if (scoresError) {
      return NextResponse.json({ error: 'Database error fetching deal scores', details: scoresError }, { status: 500 });
    }

    // 3. Fetch sessions to map crm_deal_id to assigned_rep and other details
    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('crm_deal_id, assigned_rep, prospect_name, prospect_email, signal_type, visitor_type, deal_stage')
      .eq('client_id', clientId)
      .not('crm_deal_id', 'is', null);

    if (sessionsError) {
      console.error('[Trigger Pipeline GET] Error fetching sessions:', sessionsError);
    }

    const dealRepMap = new Map<string, { rep_name: string; rep_email: string }>();
    if (sessionsData) {
      for (const s of sessionsData) {
        if (s.crm_deal_id) {
          const rep_name = s.assigned_rep || 'Unknown Rep';
          const cleanRepName = rep_name.toLowerCase().replace(/\s+/g, '.');
          const rep_email = cleanRepName !== 'unknown.rep' ? `${cleanRepName}@company.com` : 'sales@company.com';
          dealRepMap.set(s.crm_deal_id, { rep_name, rep_email });
        }
      }
    }

    // Decorate each deal score with rep details
    const decoratedScores = (dealScores || []).map((ds) => {
      const repInfo = dealRepMap.get(ds.deal_id) || { rep_name: 'Unknown Rep', rep_email: '' };
      return {
        ...ds,
        rep_name: repInfo.rep_name,
        rep_email: repInfo.rep_email,
      };
    });

    // Sort in memory: RED first, then AMBER, then GREEN
    const scorePriority: Record<string, number> = {
      'RED': 1,
      'AMBER': 2,
      'GREEN': 3,
    };

    const sortedScores = decoratedScores.sort((a, b) => {
      const priorityA = scorePriority[a.score as string] || 99;
      const priorityB = scorePriority[b.score as string] || 99;
      return priorityA - priorityB;
    });

    // 4. Query analytics_events for the last 24 hours for rule_triggered events
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: recentEvents, error: eventsError } = await supabaseAdmin
      .from('analytics_events')
      .select('session_id, created_at')
      .eq('client_id', clientId)
      .eq('event_type', 'rule_triggered')
      .gte('created_at', twentyFourHoursAgo.toISOString());

    if (eventsError) {
      console.error('[Trigger Pipeline GET] Error fetching recent events:', eventsError);
    }

    interface PipelineTrigger {
      prospect_name: string;
      company_name: string;
      deal_stage: string;
      last_visit_timestamp: string | null;
      deal_value: number;
      deal_id: string;
      rep_name: string;
      rep_email: string;
    }
    let accelerationTriggers: PipelineTrigger[] = [];
    const sessionIds = Array.from(new Set((recentEvents || []).map((e) => e.session_id).filter(Boolean)));

    if (sessionIds.length > 0) {
      const { data: matchingSessions, error: matchSessionsError } = await supabaseAdmin
        .from('sessions')
        .select('id, prospect_name, company_name, crm_deal_id, assigned_rep, prospect_email, signal_type, visitor_type, deal_stage')
        .eq('client_id', clientId)
        .in('id', sessionIds)
        .not('crm_deal_id', 'is', null);

      if (matchSessionsError) {
        console.error('[Trigger Pipeline GET] Error fetching matching sessions:', matchSessionsError);
      }

      if (matchingSessions && matchingSessions.length > 0) {
        const dealMap = new Map((dealScores || []).map((d) => [d.deal_id, d]));
        const eventTimestampMap = new Map<string, string>();

        if (recentEvents) {
          for (const ev of recentEvents) {
            if (ev.session_id) {
              const currentLatest = eventTimestampMap.get(ev.session_id);
              if (!currentLatest || new Date(ev.created_at) > new Date(currentLatest)) {
                eventTimestampMap.set(ev.session_id, ev.created_at);
              }
            }
          }
        }

        accelerationTriggers = matchingSessions
          .map((s) => {
            const deal = dealMap.get(s.crm_deal_id || '');
            if (!deal) return null;

            const rep_name = s.assigned_rep || 'Unknown Rep';
            const cleanRepName = rep_name.toLowerCase().replace(/\s+/g, '.');
            const rep_email = cleanRepName !== 'unknown.rep' ? `${cleanRepName}@company.com` : 'sales@company.com';

            return {
              prospect_name: s.prospect_name || 'Unknown Prospect',
              company_name: s.company_name || 'Unknown Company',
              deal_stage: deal.stage || 'Unknown Stage',
              last_visit_timestamp: eventTimestampMap.get(s.id) || null,
              deal_value: deal.deal_value || 0,
              deal_id: s.crm_deal_id || '',
              rep_name,
              rep_email,
            };
          })
          .filter((t) => t !== null);
      }
    }

    return NextResponse.json({
      success: true,
      pipeline_snapshot: latestSnapshot || null,
      deal_scores: sortedScores,
      acceleration_triggers: accelerationTriggers,
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
