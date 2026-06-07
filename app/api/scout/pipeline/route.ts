import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getClientPlan, planGate } from '@/lib/gate';

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

export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Scout Pipeline GET] Authenticated client ID:', clientId);

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get('refresh') === 'true';
    const cacheKey = `scout:pipeline_api:${clientId}`;

    if (!refresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log('[Scout Pipeline GET] Cache hit for client:', clientId);
          return NextResponse.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
        }
      } catch (cacheErr) {
        console.error('[Scout Pipeline GET Cache Error] Failed to read from Redis:', cacheErr);
      }
    }

    // 2. Fetch the latest snapshot for this client
    console.log('[Scout Pipeline GET] Fetching latest snapshot...');
    const snapshotRes = await supabaseAdmin
      .from('pipeline_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[Scout Pipeline GET] Raw snapshot query response:', JSON.stringify(snapshotRes, null, 2));
    const { data: latestSnapshot, error: snapshotError } = snapshotRes;

    if (snapshotError) {
      console.error('[Scout Pipeline GET] Error fetching latest snapshot:', snapshotError);
      return NextResponse.json({ error: 'Database error fetching pipeline snapshot' }, { status: 500 });
    }

    // 3. Fetch deal scores for this client
    console.log('[Scout Pipeline GET] Fetching deal scores...');
    const dealScoresRes = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    console.log('[Scout Pipeline GET] Raw deal scores query response:', JSON.stringify(dealScoresRes, null, 2));
    const { data: dealScores, error: scoresError } = dealScoresRes;

    if (scoresError) {
      console.error('[Scout Pipeline GET] Error fetching deal scores:', scoresError);
      return NextResponse.json({ error: 'Database error fetching deal scores' }, { status: 500 });
    }

    // 4. Fetch sessions to map crm_deal_id to assigned_rep and other details
    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('crm_deal_id, assigned_rep, prospect_name, prospect_email, signal_type, visitor_type, deal_stage')
      .eq('client_id', clientId)
      .not('crm_deal_id', 'is', null);

    if (sessionsError) {
      console.error('[Scout Pipeline GET] Error fetching sessions for rep mapping:', sessionsError);
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
        rep_name: ds.rep_name || repInfo.rep_name,
        rep_email: ds.rep_email || repInfo.rep_email,
      };
    });

    // 5. Sort in memory: RED first, then AMBER, then GREEN
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

    // 6. Query analytics_events for the last 24 hours for rule_triggered events
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: recentEvents, error: eventsError } = await supabaseAdmin
      .from('analytics_events')
      .select('session_id, created_at')
      .eq('client_id', clientId)
      .eq('event_type', 'rule_triggered')
      .gte('created_at', twentyFourHoursAgo.toISOString());

    if (eventsError) {
      console.error('[Scout Pipeline GET] Error fetching recent events:', eventsError);
    }

    // Cross-reference recent visits with open deals
    const sessionIds = Array.from(new Set((recentEvents || []).map((e) => e.session_id).filter(Boolean)));
    interface Trigger {
      prospect_name: string;
      company_name: string;
      deal_stage: string;
      last_visit_timestamp: string | null;
      deal_value: number;
      deal_id: string;
      rep_name: string;
      rep_email: string;
    }
    let accelerationTriggers: Trigger[] = [];

    if (sessionIds.length > 0) {
      const { data: matchingSessions, error: matchSessionsError } = await supabaseAdmin
        .from('sessions')
        .select('id, prospect_name, company_name, crm_deal_id, assigned_rep, prospect_email, signal_type, visitor_type, deal_stage')
        .eq('client_id', clientId)
        .in('id', sessionIds)
        .not('crm_deal_id', 'is', null);

      if (matchSessionsError) {
        console.error('[Scout Pipeline GET] Error fetching matching sessions:', matchSessionsError);
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

            const rep_name = deal.rep_name || s.assigned_rep || 'Unknown Rep';
            const cleanRepName = rep_name.toLowerCase().replace(/\s+/g, '.');
            const rep_email = deal.rep_email || (cleanRepName !== 'unknown.rep' ? `${cleanRepName}@company.com` : 'sales@company.com');

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
          .filter((t): t is Trigger => t !== null);
      }
    }

    // 7. Return both deal scores, latest snapshot, and acceleration triggers
    const responsePayload = {
      pipeline_snapshot: latestSnapshot || null,
      deal_scores: sortedScores,
      acceleration_triggers: accelerationTriggers,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(responsePayload), { ex: 60 });
    } catch (cacheErr) {
      console.error('[Scout Pipeline GET Cache Write Error] Failed to write to Redis:', cacheErr);
    }

    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('[Scout Pipeline GET Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
