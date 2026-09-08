import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { logLLMCall } from '@/lib/llm/logger';
import { generateText } from '@/lib/llm/complete';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import {
  parseDigestAggregate,
  selectBestRep,
  selectBestRule,
  selectTopSignal,
} from '@/lib/analytics/digest';
import { weeklyDigestOutputSchema } from '@/lib/validation';
import { getPreviousUtcWeekRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

// GET handler: retrieves the latest generated Weekly Digest
export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: latestDigest, error } = await supabaseAdmin
      .from('weekly_digests')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Digest GET Error] Supabase query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ digest: latestDigest || null });

  } catch (error) {
    console.error('[Digest GET Exception] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// POST handler: calculates metrics and generates a weekly performance digest
export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Manual and scheduled generation must use the same completed UTC week so
    // repeated runs are idempotent and always report identical date bounds.
    const { periodStart, periodEnd, weekStart: weekStartStr } = getPreviousUtcWeekRange();
    const previousStart = new Date(
      new Date(periodStart).getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const cacheKey = `digest:${clientId}:${weekStartStr}`;
    // Check cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return NextResponse.json({ digest: parsed, source: 'cache' });
      }
    } catch (cacheErr) {
      console.error('[Digest Cache Read Error]:', cacheErr);
    }

    const { data: scheduledDigest, error: scheduledLookupError } = await supabaseAdmin
      .from('weekly_digests')
      .select('id, delivery_status, sent_at, summary, top_signal, rep_spotlight, recommendation')
      .eq('client_id', clientId).eq('week_start', weekStartStr).maybeSingle();
    if (scheduledLookupError) throw scheduledLookupError;
    // Never overwrite a scheduled delivery that is currently being processed.
    if (scheduledDigest?.delivery_status === 'processing') {
      return NextResponse.json({ digest: scheduledDigest, source: 'scheduled' });
    }

    // Calculate both seven-day windows inside Postgres. This uses immutable
    // event timestamps and exact server-side counts, so historical digests do
    // not drift and are not truncated by PostgREST's row limit.
    const { data: aggregateData, error: aggregateError } = await supabaseAdmin.rpc(
      'digest_v2_aggregate',
      {
        client_id_input: clientId,
        current_start_input: periodStart,
        previous_start_input: previousStart,
        period_end_input: periodEnd,
      }
    );
    const aggregate = parseDigestAggregate(aggregateData);
    if (aggregateError || !aggregate) {
      console.error('[Digest POST Error] Aggregate calculation failed:', aggregateError);
      return NextResponse.json({ error: 'Unable to calculate digest metrics' }, { status: 500 });
    }

    const topSignalMetric = selectTopSignal(aggregate.current.signals);
    const topSignal = topSignalMetric?.signal || 'None';
    const previousSignalMetric = topSignalMetric
      ? aggregate.previous.signals.find((signal) => signal.signal === topSignalMetric.signal)
      : null;
    const previousSignalRate = previousSignalMetric?.rate || 0;
    const signalPercentageChange = topSignalMetric
      ? previousSignalRate > 0
        ? Math.round(((topSignalMetric.rate - previousSignalRate) / previousSignalRate) * 100)
        : topSignalMetric.rate > 0 ? 100 : 0
      : 0;

    const bestRepMetric = selectBestRep(aggregate.current.reps);
    const bestRuleMetric = selectBestRule(aggregate.current.rules);

    // Compute best performing routing rule (triggered the most this week).
    let bestRuleDesc = 'None';
    if (bestRuleMetric) {
      // Fetch details with the tenant boundary repeated at the write/read edge.
      const { data: ruleDetails, error: ruleDetailsError } = await supabaseAdmin
        .from('routing_rules')
        .select('signal_type, priority')
        .eq('id', bestRuleMetric.rule_id)
        .eq('client_id', clientId)
        .maybeSingle();

      if (ruleDetailsError) {
        console.error('[Digest POST Error] Best rule lookup failed:', ruleDetailsError);
      }

      if (ruleDetails) {
        bestRuleDesc = `Priority ${ruleDetails.priority} (${ruleDetails.signal_type || 'Any'} Signal) rule with ${bestRuleMetric.triggers} triggers`;
      } else {
        bestRuleDesc = `Rule ID ${bestRuleMetric.rule_id} with ${bestRuleMetric.triggers} triggers`;
      }
    }

    // Scout pipeline health (non-fatal) for a two-pillar digest
    let pipelineHealthLine = '';
    try {
      const { data: snap, error: snapshotError } = await supabaseAdmin
        .from('pipeline_snapshots')
        .select('pressure_score, red_count, amber_count, total_deals')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshotError) throw snapshotError;
      if (snap && (snap.total_deals || 0) > 0) {
        const atRisk = (snap.red_count || 0) + (snap.amber_count || 0);
        pipelineHealthLine = `\n- Pipeline health (Scout): pressure score ${snap.pressure_score}/100, ${atRisk} of ${snap.total_deals} open deals flagged at risk (RED/AMBER).`;
      }
    } catch (e) {
      console.error('[Digest] pipeline health fetch failed (non-fatal):', e);
    }

    const performanceData = {
      top_signal_this_week: topSignal,
      top_signal_conversion_rate: topSignalMetric ? `${Math.round(topSignalMetric.rate * 100)}%` : '0%',
      top_signal_change_vs_last_week: signalPercentageChange >= 0 ? `+${signalPercentageChange}%` : `${signalPercentageChange}%`,
      best_converting_rep: bestRepMetric ? `${bestRepMetric.rep} (${bestRepMetric.conversions} conversions)` : 'None',
      personalization_triggers_this_week: aggregate.current.triggers,
      personalization_triggers_last_week: aggregate.previous.triggers,
      best_performing_rule: bestRuleDesc,
    };

    // 3. Call Together AI API

    const digestPrompt = `You are a B2B revenue analyst writing a weekly performance digest for a SaaS company using website personalization.
Data:
- Top converting traffic source/signal: ${performanceData.top_signal_this_week} (Conversion rate: ${performanceData.top_signal_conversion_rate}, Change from last week: ${performanceData.top_signal_change_vs_last_week})
- Best performing sales rep: ${performanceData.best_converting_rep}
- Total personalization triggers this week vs last week: ${performanceData.personalization_triggers_this_week} (this week) vs ${performanceData.personalization_triggers_last_week} (last week)
- Best performing routing rule: ${performanceData.best_performing_rule}${pipelineHealthLine}

Write a plain-English digest with 4 sections:
1. THIS WEEK SUMMARY (2 sentences summarizing triggers variation, conversion performance, and — if pipeline health data is shown above — overall deal-pipeline risk)
2. TOP SIGNAL (1 sentence explaining which signal performed best)
3. REP SPOTLIGHT (1 sentence celebrating the top converting rep)
4. ONE RECOMMENDATION (1 actionable sentence on how to optimize rules or links)

Tone: direct, data-driven, peer-level. Total under 150 words.
Output only a JSON object with keys: summary, top_signal, rep_spotlight, recommendation. Do not include markdown formatting or preamble.`;

    const llmStart = Date.now();
    let rawText = '{}';
    try { rawText = (await generateText(digestPrompt, { maxTokens: 1500, context: { feature: 'weekly_digest_manual', scope: 'customer', clientId } })) || '{}'; }
    catch (error) { console.error('[Digest AI] unavailable; using deterministic summary:', error instanceof Error ? error.message : 'unknown'); rawText = JSON.stringify({ summary: `This week recorded ${aggregate.current.triggers} personalization triggers and ${aggregate.current.conversions} conversions.`, top_signal: `Top signal: ${topSignal}.`, rep_spotlight: performanceData.best_converting_rep === 'None' ? 'No rep conversion data was available.' : `Top rep: ${performanceData.best_converting_rep}.`, recommendation: 'Review your highest-volume signal and keep its best-performing rule active.' }); }

    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let digestJson: { summary: string; top_signal: string; rep_spotlight: string; recommendation: string };
    try {
      digestJson = weeklyDigestOutputSchema.parse(JSON.parse(cleanedText));
    } catch (parseErr) {
      console.error('[Digest Parse Error] Falling back to deterministic digest:', parseErr);
      digestJson = { summary: `This week recorded ${aggregate.current.triggers} personalization triggers and ${aggregate.current.conversions} conversions.`, top_signal: `Top signal: ${topSignal}.`, rep_spotlight: performanceData.best_converting_rep === 'None' ? 'No rep conversion data was available.' : `Top rep: ${performanceData.best_converting_rep}.`, recommendation: 'Review your highest-volume signal and keep its best-performing rule active.' };
    }

    logLLMCall({
      client_id: clientId,
      feature: 'weekly_digest',
      input_payload: performanceData as unknown as Record<string, unknown>,
      output_payload: digestJson as unknown as Record<string, unknown>,
      latency_ms: Date.now() - llmStart,
    });

    // 4. Store Weekly Digest in weekly_digests table
    const digestValues = {
        client_id: clientId,
        week_start: weekStartStr,
        summary: digestJson.summary,
        top_signal: digestJson.top_signal,
        rep_spotlight: digestJson.rep_spotlight,
        recommendation: digestJson.recommendation,
      };
    let savedDigest: typeof scheduledDigest;
    let insertErr: { message: string; code?: string } | null = null;
    if (scheduledDigest?.id) {
      const result = await supabaseAdmin.from('weekly_digests').update(digestValues)
        .eq('id', scheduledDigest.id).neq('delivery_status', 'processing').select().maybeSingle();
      savedDigest = result.data;
      insertErr = result.error;
      if (!savedDigest && !insertErr) savedDigest = scheduledDigest;
    } else {
      const result = await supabaseAdmin.from('weekly_digests').insert(digestValues).select().maybeSingle();
      savedDigest = result.data;
      insertErr = result.error;
      if (insertErr?.code === '23505') {
        const raced = await supabaseAdmin.from('weekly_digests').select().eq('client_id', clientId).eq('week_start', weekStartStr).maybeSingle();
        savedDigest = raced.data;
        insertErr = raced.error;
      }
    }

    if (insertErr || !savedDigest) {
      console.error('[Digest Save Error] Failed inserting weekly digest:', insertErr);
      return NextResponse.json({ error: insertErr?.message || 'Unable to save digest' }, { status: 500 });
    }

    // 5. Cache result in Redis for 24 hours (86,400 seconds)
    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(savedDigest));
    } catch (cacheSetErr) {
      console.error('[Digest Cache Write Error]:', cacheSetErr);
    }

    return NextResponse.json({ digest: savedDigest });

  } catch (error) {
    console.error('[Digest POST Exception] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
