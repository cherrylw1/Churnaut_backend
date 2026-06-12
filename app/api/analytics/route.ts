import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Analytics window: last 90 days by default, overridable via ?days= param
    const url = new URL(req.url);
    const days = Math.min(365, Math.max(7, parseInt(url.searchParams.get('days') || '90', 10)));
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch sessions within window (capped at 2000 rows)
    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('client_id', clientId)
      .gte('created_at', fromDate)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (sessionsErr) {
      console.error('[GET Analytics Error] Sessions fetch failed:', sessionsErr);
      return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
    }

    const totalSessions = sessions?.length || 0;

    // 2. Fetch analytics events within window (capped at 10000 rows)
    const { data: events, error: eventsErr } = await supabaseAdmin
      .from('analytics_events')
      .select('*')
      .eq('client_id', clientId)
      .gte('created_at', fromDate)
      .order('created_at', { ascending: false })
      .limit(10000);

    if (eventsErr) {
      console.error('[GET Analytics Error] Events fetch failed:', eventsErr);
      return NextResponse.json({ error: eventsErr.message }, { status: 500 });
    }

    const resolveEvents = events?.filter(e => e.event_type === 'resolve') || [];

    // 3. Fetch routing rules for mappings
    const { data: rules } = await supabaseAdmin
      .from('routing_rules')
      .select('*')
      .eq('client_id', clientId);

    // 4. Calculate Summary Stats (Created in the current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthISO = startOfMonth.toISOString();

    const monthlySessions = sessions?.filter(s => s.created_at >= startOfMonthISO) || [];
    const totalLinksThisMonth = monthlySessions.length;

    // Click aggregates (clicks from sessions created/updated this month)
    const totalClicksThisMonth = monthlySessions.reduce((sum, s) => sum + (s.click_count || 0), 0);

    // Personalization trigger rate (ratio of resolve events to total sessions)
    const triggerRate = totalSessions > 0
      ? Math.min(100, Math.round((resolveEvents.length / totalSessions) * 100))
      : 0;

    // Overall conversion rate
    const totalConverted = sessions?.filter(s => s.converted).length || 0;
    const overallConversionRate = totalSessions > 0
      ? Math.min(100, Math.round((totalConverted / totalSessions) * 100))
      : 0;

    // 5. Signal Breakdown Aggregation
    const signalGroups: Record<string, { signal: string; links: number; clicks: number; conversions: number }> = {};
    if (sessions) {
      for (const s of sessions) {
        const sig = s.signal_type || 'Outbound Link';
        if (!signalGroups[sig]) {
          signalGroups[sig] = { signal: sig, links: 0, clicks: 0, conversions: 0 };
        }
        signalGroups[sig].links += 1;
        signalGroups[sig].clicks += s.click_count || 0;
        if (s.converted) {
          signalGroups[sig].conversions += 1;
        }
      }
    }
    const signalBreakdown = Object.values(signalGroups).map(item => ({
      ...item,
      conversion_rate: Math.round((item.conversions / Math.max(1, item.links)) * 100),
    }));

    // 6. Rule Performance Aggregation
    const ruleGroups: Record<string, { triggers: number; conversions: number }> = {};
    for (const e of resolveEvents) {
      const rid = e.rule_id;
      if (rid) {
        if (!ruleGroups[rid]) {
          ruleGroups[rid] = { triggers: 0, conversions: 0 };
        }
        ruleGroups[rid].triggers += 1;
        
        // Find if this specific trigger lead to a conversion
        const sessionRow = sessions?.find(s => s.id === e.session_id);
        if (sessionRow && sessionRow.converted) {
          ruleGroups[rid].conversions += 1;
        }
      }
    }

    const rulePerformance = (rules || []).map(r => {
      const perf = ruleGroups[r.id] || { triggers: 0, conversions: 0 };
      return {
        rule_id: r.id,
        priority: r.priority,
        signal_type: r.signal_type || 'Any Signal',
        action_type: r.action_type,
        triggers: perf.triggers,
        conversions: perf.conversions,
        conversion_rate: Math.round((perf.conversions / Math.max(1, perf.triggers)) * 100),
      };
    }).sort((a, b) => a.priority - b.priority);

    // 7. Rep Performance Aggregation
    const repGroups: Record<string, { rep: string; links: number; conversions: number }> = {};
    if (sessions) {
      for (const s of sessions) {
        if (s.assigned_rep) {
          const rep = s.assigned_rep;
          if (!repGroups[rep]) {
            repGroups[rep] = { rep, links: 0, conversions: 0 };
          }
          repGroups[rep].links += 1;
          if (s.converted) {
            repGroups[rep].conversions += 1;
          }
        }
      }
    }
    const repPerformance = Object.values(repGroups).map(item => ({
      ...item,
      conversion_rate: Math.round((item.conversions / Math.max(1, item.links)) * 100),
    }));

    // 8. Recent events (last 20 events)
    const sortedEvents = [...(events || [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    const recentEvents = sortedEvents.map(e => {
      const sessionRow = sessions?.find(s => s.id === e.session_id);
      return {
        id: e.id,
        event_type: e.event_type,
        signal_type: e.signal_type || 'Unknown',
        created_at: e.created_at,
        prospect_name: sessionRow?.prospect_name || 'Anonymous',
      };
    });

    // 9. Daily Volume (Past 30 Days)
    const dailyVolume: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split('T')[0];
      dailyVolume[dateString] = 0;
    }

    for (const e of resolveEvents) {
      const dateString = e.created_at.split('T')[0];
      if (dailyVolume[dateString] !== undefined) {
        dailyVolume[dateString] += 1;
      }
    }

    const dailyVolumeArray = Object.keys(dailyVolume).map(date => {
      const formattedDate = new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return {
        date: formattedDate,
        rawDate: date,
        count: dailyVolume[date],
      };
    });

    return NextResponse.json({
      summaryStats: {
        totalLinksCreatedThisMonth: totalLinksThisMonth,
        totalClicksThisMonth: totalClicksThisMonth,
        personalizationTriggerRate: triggerRate,
        overallConversionRate: overallConversionRate,
      },
      signalBreakdown,
      rulePerformance,
      recentEvents,
      repPerformance,
      dailyVolume: dailyVolumeArray,
    });

  } catch (err) {
    console.error('[GET Analytics Exception] Unhandled error:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
