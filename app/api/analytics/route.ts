import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RuleMetric = { rule_id: string; triggers: number; conversions: number; conversion_rate: number };
type LiftMetric = { rule_id: string; personalized_sessions: number; personalized_rate: number };
type Aggregate = {
  summaryStats: Record<string, number>;
  signalBreakdown: unknown[];
  repPerformance: unknown[];
  rulePerformance: RuleMetric[];
  dailyVolume: Array<{ rawDate: string; count: number }>;
  liftReport: { personalized_sessions: number; unpersonalized_sessions: number; personalized_rate: number; baseline_rate: number; overall_lift_pp: number; rules: LiftMetric[] };
};

export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rawDays = new URL(req.url).searchParams.get('days') || '90';
    if (!/^\d+$/.test(rawDays)) return NextResponse.json({ error: 'days must be an integer' }, { status: 400 });
    const days = Number(rawDays);
    if (days < 7 || days > 365) return NextResponse.json({ error: 'days must be between 7 and 365' }, { status: 400 });
    const fromDate = new Date(Date.now() - days * 86_400_000).toISOString();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [{ data: aggregateData, error: aggregateError }, { data: rules, error: rulesError }, { data: recent, error: recentError }] = await Promise.all([
      supabaseAdmin.rpc('analytics_v2_aggregate', { client_id_input: clientId, from_date_input: fromDate, month_start_input: monthStart }),
      supabaseAdmin.from('routing_rules').select('id, priority, signal_type, action_type').eq('client_id', clientId),
      supabaseAdmin.from('analytics_events').select('id, session_id, event_type, signal_type, created_at').eq('client_id', clientId).gte('created_at', fromDate).order('created_at', { ascending: false }).limit(20),
    ]);
    if (aggregateError || rulesError || recentError || !aggregateData) {
      console.error('[GET Analytics Error] Aggregate query failed:', aggregateError || rulesError || recentError);
      return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
    }

    const aggregate = aggregateData as Aggregate;
    const ruleById = new Map((rules || []).map((rule) => [rule.id, rule]));
    const metricByRule = new Map((aggregate.rulePerformance || []).map((metric) => [metric.rule_id, metric]));
    const rulePerformance = (rules || []).map((rule) => {
      const metric = metricByRule.get(rule.id) || { rule_id: rule.id, triggers: 0, conversions: 0, conversion_rate: 0 };
      return { ...metric, priority: rule.priority, signal_type: rule.signal_type || 'Any Signal', action_type: rule.action_type };
    }).sort((a, b) => a.priority - b.priority);

    const baselineRate = aggregate.liftReport?.baseline_rate || 0;
    const liftRules = (aggregate.liftReport?.rules || []).map((metric) => {
      const rule = ruleById.get(metric.rule_id);
      return { ...metric, signal_type: rule?.signal_type || 'Any Signal', action_type: rule?.action_type || 'Unknown', baseline_rate: baselineRate, lift_pp: metric.personalized_rate - baselineRate };
    }).sort((a, b) => b.lift_pp - a.lift_pp);

    const sessionIds = [...new Set((recent || []).map((event) => event.session_id).filter((id): id is string => !!id))];
    const sessionResult = sessionIds.length
      ? await supabaseAdmin.from('sessions').select('id, prospect_name').eq('client_id', clientId).in('id', sessionIds)
      : { data: [], error: null };
    if (sessionResult.error) return NextResponse.json({ error: 'Recent event lookup failed' }, { status: 500 });
    const names = new Map((sessionResult.data || []).map((session) => [session.id, session.prospect_name || 'Anonymous']));
    const recentEvents = (recent || []).map((event) => ({ id: event.id, event_type: event.event_type, signal_type: event.signal_type || 'Unknown', created_at: event.created_at, prospect_name: event.session_id ? names.get(event.session_id) || 'Anonymous' : 'Anonymous' }));

    const dailyByDate = new Map((aggregate.dailyVolume || []).map((item) => [item.rawDate, item.count]));
    const displayDays = Math.min(30, days);
    const dailyVolume = Array.from({ length: displayDays }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (displayDays - index - 1));
      const rawDate = date.toISOString().slice(0, 10);
      return { date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }), rawDate, count: dailyByDate.get(rawDate) || 0 };
    });

    return NextResponse.json({ analyticsVersion: 2, historicalNote: 'Exact click timing is available only for Analytics v2 events; legacy cumulative click counts are not backfilled.', summaryStats: aggregate.summaryStats, signalBreakdown: aggregate.signalBreakdown || [], rulePerformance, recentEvents, repPerformance: aggregate.repPerformance || [], dailyVolume, liftReport: { ...aggregate.liftReport, rules: liftRules } });
  } catch (error) {
    console.error('[GET Analytics Exception]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
