import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { logLLMCall } from '@/lib/llm/logger';
import { generateText } from '@/lib/llm/complete';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';

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

// POST handler: calculates metrics and calls Gemini to generate a weekly performance digest
export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = `digest:${clientId}`;
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

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // 1. Fetch sessions for the last 14 days
    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from('sessions')
      .select('created_at, signal_type, converted, assigned_rep')
      .eq('client_id', clientId)
      .gte('created_at', fourteenDaysAgo.toISOString());

    if (sessionsErr) {
      console.error('[Digest POST Error] Fetching sessions failed:', sessionsErr);
    }

    // 2. Fetch analytics personalization triggers (events) for the last 14 days
    const { data: events, error: eventsErr } = await supabaseAdmin
      .from('analytics_events')
      .select('created_at, rule_id')
      .eq('client_id', clientId)
      .eq('event_type', 'rule_triggered')
      .gte('created_at', fourteenDaysAgo.toISOString());

    if (eventsErr) {
      console.error('[Digest POST Error] Fetching events failed:', eventsErr);
    }

    const thisWeekSessions = (sessions || []).filter(s => new Date(s.created_at) >= sevenDaysAgo);
    const lastWeekSessions = (sessions || []).filter(s => new Date(s.created_at) < sevenDaysAgo);

    // Compute Personalization Triggers
    const thisWeekTriggers = (events || []).filter(e => new Date(e.created_at) >= sevenDaysAgo).length;
    const lastWeekTriggers = (events || []).filter(e => new Date(e.created_at) < sevenDaysAgo).length;

    // Compute Top converting signal this week with percentage change from previous week
    let topSignal = 'None';
    let signalPercentageChange = 0;

    const computeSignalRates = (sessList: typeof sessions) => {
      const counts: Record<string, { total: number; converted: number }> = {};
      for (const s of sessList || []) {
        const sig = s.signal_type || 'Any';
        if (!counts[sig]) counts[sig] = { total: 0, converted: 0 };
        counts[sig].total++;
        if (s.converted) counts[sig].converted++;
      }

      const rates: Record<string, number> = {};
      for (const sig in counts) {
        rates[sig] = counts[sig].total > 0 ? counts[sig].converted / counts[sig].total : 0;
      }
      return { counts, rates };
    };

    const thisWeekSignalData = computeSignalRates(thisWeekSessions);
    const lastWeekSignalData = computeSignalRates(lastWeekSessions);

    let maxRate = -1;
    for (const sig in thisWeekSignalData.rates) {
      const rate = thisWeekSignalData.rates[sig];
      // Require at least 1 session to consider
      if (rate > maxRate && thisWeekSignalData.counts[sig].total > 0) {
        maxRate = rate;
        topSignal = sig;
      }
    }

    if (topSignal !== 'None') {
      const thisRate = thisWeekSignalData.rates[topSignal] || 0;
      const lastRate = lastWeekSignalData.rates[topSignal] || 0;
      if (lastRate > 0) {
        signalPercentageChange = Math.round(((thisRate - lastRate) / lastRate) * 100);
      } else {
        signalPercentageChange = thisRate > 0 ? 100 : 0;
      }
    }

    // Compute best converting rep this week
    let bestRep = 'None';
    const repConversions: Record<string, number> = {};
    for (const s of thisWeekSessions) {
      if (s.assigned_rep && s.converted) {
        repConversions[s.assigned_rep] = (repConversions[s.assigned_rep] || 0) + 1;
      }
    }
    let maxRepConversions = 0;
    for (const rep in repConversions) {
      if (repConversions[rep] > maxRepConversions) {
        maxRepConversions = repConversions[rep];
        bestRep = rep;
      }
    }

    // Compute best performing routing rule (triggered the most this week)
    let bestRuleDesc = 'None';
    const ruleTriggerCounts: Record<string, number> = {};
    for (const e of (events || []).filter(ev => new Date(ev.created_at) >= sevenDaysAgo)) {
      if (e.rule_id) {
        ruleTriggerCounts[e.rule_id] = (ruleTriggerCounts[e.rule_id] || 0) + 1;
      }
    }
    let maxRuleTriggers = 0;
    let bestRuleId = '';
    for (const rId in ruleTriggerCounts) {
      if (ruleTriggerCounts[rId] > maxRuleTriggers) {
        maxRuleTriggers = ruleTriggerCounts[rId];
        bestRuleId = rId;
      }
    }

    if (bestRuleId) {
      // Fetch details of this rule
      const { data: ruleDetails } = await supabaseAdmin
        .from('routing_rules')
        .select('signal_type, priority')
        .eq('id', bestRuleId)
        .maybeSingle();

      if (ruleDetails) {
        bestRuleDesc = `Priority ${ruleDetails.priority} (${ruleDetails.signal_type || 'Any'} Signal) rule with ${maxRuleTriggers} triggers`;
      } else {
        bestRuleDesc = `Rule ID ${bestRuleId} with ${maxRuleTriggers} triggers`;
      }
    }

    const performanceData = {
      top_signal_this_week: topSignal,
      top_signal_conversion_rate: topSignal !== 'None' ? `${Math.round((thisWeekSignalData.rates[topSignal] || 0) * 100)}%` : '0%',
      top_signal_change_vs_last_week: signalPercentageChange >= 0 ? `+${signalPercentageChange}%` : `${signalPercentageChange}%`,
      best_converting_rep: bestRep !== 'None' ? `${bestRep} (${maxRepConversions} conversions)` : 'None',
      personalization_triggers_this_week: thisWeekTriggers,
      personalization_triggers_last_week: lastWeekTriggers,
      best_performing_rule: bestRuleDesc,
    };

    // 3. Call Together AI API

    const geminiPrompt = `You are a B2B revenue analyst writing a weekly performance digest for a SaaS company using website personalization.
Data:
- Top converting traffic source/signal: ${performanceData.top_signal_this_week} (Conversion rate: ${performanceData.top_signal_conversion_rate}, Change from last week: ${performanceData.top_signal_change_vs_last_week})
- Best performing sales rep: ${performanceData.best_converting_rep}
- Total personalization triggers this week vs last week: ${performanceData.personalization_triggers_this_week} (this week) vs ${performanceData.personalization_triggers_last_week} (last week)
- Best performing routing rule: ${performanceData.best_performing_rule}

Write a plain-English digest with 4 sections:
1. THIS WEEK SUMMARY (2 sentences summarizing triggers variation and general conversion performance)
2. TOP SIGNAL (1 sentence explaining which signal performed best)
3. REP SPOTLIGHT (1 sentence celebrating the top converting rep)
4. ONE RECOMMENDATION (1 actionable sentence on how to optimize rules or links)

Tone: direct, data-driven, peer-level. Total under 150 words.
Output only a JSON object with keys: summary, top_signal, rep_spotlight, recommendation. Do not include markdown formatting or preamble.`;

    const llmStart = Date.now();
    const rawText = (await generateText(geminiPrompt, { maxTokens: 1500 })) || '{}';

    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let digestJson: { summary: string; top_signal: string; rep_spotlight: string; recommendation: string };
    try {
      digestJson = JSON.parse(cleanedText);
      if (!digestJson.summary || !digestJson.top_signal || !digestJson.rep_spotlight || !digestJson.recommendation) {
        throw new Error('Missing key sections in Gemini response');
      }
    } catch (parseErr) {
      console.error('[Digest Parse Error] Failed parsing JSON:', cleanedText, parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 502 });
    }

    logLLMCall({
      client_id: clientId,
      feature: 'weekly_digest',
      input_payload: performanceData as unknown as Record<string, unknown>,
      output_payload: digestJson as unknown as Record<string, unknown>,
      latency_ms: Date.now() - llmStart,
    });

    // 4. Store Weekly Digest in weekly_digests table
    const weekStartStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: savedDigest, error: insertErr } = await supabaseAdmin
      .from('weekly_digests')
      .insert({
        client_id: clientId,
        week_start: weekStartStr,
        summary: digestJson.summary,
        top_signal: digestJson.top_signal,
        rep_spotlight: digestJson.rep_spotlight,
        recommendation: digestJson.recommendation,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[Digest Save Error] Failed inserting weekly digest:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
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
