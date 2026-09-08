import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { generateJSON } from '@/lib/llm/complete';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import { alertPatchRequestSchema, readJson } from '@/lib/validation';
import { parseAnomalyAggregate } from '@/lib/analytics/anomaly';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const generatedAlertsSchema = z.array(z.string().trim().min(1).max(500)).min(1).max(3);

async function handleAnomalyRequest(req: NextRequest, runDetection: boolean) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!runDetection) {
      // Fetch unread alerts
      const { data: alerts, error } = await supabaseAdmin
        .from('anomaly_alerts')
        .select('*')
        .eq('client_id', clientId)
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Anomaly Get Error] Supabase query failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ alerts: alerts || [] });
    }

    // --- RUN ANOMALY DETECTION ---
    const cacheKey = `anomaly_alerts_run:${clientId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return NextResponse.json({ alerts: parsed, source: 'cache' });
      }
    } catch (cacheErr) {
      console.error('[Anomaly Cache Read Error]:', cacheErr);
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // 1. Fetch active routing rules to compare trigger counts and detect new rules
    const { data: rules, error: rulesErr } = await supabaseAdmin
      .from('routing_rules')
      .select('id, signal_type, priority, created_at')
      .eq('client_id', clientId)
      .eq('active', true);

    if (rulesErr) {
      console.error('[Anomaly Detection Error] Fetching rules failed:', rulesErr);
      return NextResponse.json({ error: rulesErr.message }, { status: 500 });
    }

    // 2. Query exact server-side aggregates. Event timestamps determine each
    // period, and the result cannot be truncated by PostgREST row limits.
    const { data: aggregateData, error: aggregateError } = await supabaseAdmin.rpc(
      'anomaly_v2_aggregate',
      {
        client_id_input: clientId,
        current_start_input: sevenDaysAgo.toISOString(),
        previous_start_input: fourteenDaysAgo.toISOString(),
        period_end_input: new Date().toISOString(),
      }
    );
    const aggregate = parseAnomalyAggregate(aggregateData);
    if (aggregateError || !aggregate) {
      console.error('[Anomaly Detection Error] Aggregate calculation failed:', aggregateError);
      return NextResponse.json({ error: 'Unable to calculate anomaly metrics' }, { status: 500 });
    }

    // Grouping triggers daily in-memory
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    const last3Days = days.slice(0, 3);
    const prev4Days = days.slice(3, 7);

    const ruleDailyTriggers: Record<string, Record<string, number>> = {};
    for (const rule of rules || []) {
      ruleDailyTriggers[rule.id] = {};
      for (const day of days) {
        ruleDailyTriggers[rule.id][day] = 0;
      }
    }

    for (const metric of aggregate.rule_daily) {
      if (ruleDailyTriggers[metric.rule_id]?.[metric.day] !== undefined) {
        ruleDailyTriggers[metric.rule_id][metric.day] = metric.count;
      }
    }

    const anomalies: string[] = [];

    // Analyze rules trigger drop-offs and new rules zero triggers
    for (const rule of rules || []) {
      const ruleId = rule.id;
      const signalType = rule.signal_type || 'Any';

      let last3Sum = 0;
      for (const day of last3Days) {
        last3Sum += ruleDailyTriggers[ruleId][day] || 0;
      }
      const last3Avg = last3Sum / 3;

      let prev4Sum = 0;
      for (const day of prev4Days) {
        prev4Sum += ruleDailyTriggers[ruleId][day] || 0;
      }
      const prev4Avg = prev4Sum / 4;

      // Rule trigger count dropped more than 60%
      if (prev4Avg > 0) {
        const drop = (prev4Avg - last3Avg) / prev4Avg;
        if (drop > 0.60) {
          anomalies.push(`Your ${signalType} routing rule has not fired normally in the last 3 days — your tracked links may be broken`);
        }
      }

      // Rule created in the last 7 days and has zero triggers
      const ruleCreatedDate = new Date(rule.created_at);
      if (ruleCreatedDate >= sevenDaysAgo) {
        let totalTriggers = 0;
        for (const day of days) {
          totalTriggers += ruleDailyTriggers[ruleId][day] || 0;
        }
        if (totalTriggers === 0) {
          anomalies.push(`Your new ${signalType} rule has not fired yet — verify your snippet installation`);
        }
      }
    }

    // 3. Compare event-timed conversion rates for the two seven-day windows.
    if (aggregate.previous.rate > 0) {
      const convDrop = (aggregate.previous.rate - aggregate.current.rate) / aggregate.previous.rate;
      if (convDrop > 0.40) {
        anomalies.push('Overall conversion rate dropped significantly this week');
      }
    }

    // If no anomalies detected, return empty alerts array
    if (anomalies.length === 0) {
      try {
        await redis.setex(cacheKey, 3600, JSON.stringify([]));
      } catch (cacheSetErr) {
        console.error('[Anomaly Cache Write Error]:', cacheSetErr);
      }
      return NextResponse.json({ alerts: [] });
    }

    // 4. Call Together AI API to compile alerts

    const prompt = `You are a B2B SaaS performance analyst. Here are anomalies detected in a website personalization system:
${anomalies.map(a => `- ${a}`).join('\n')}

Write 1-3 short, plain-English alert messages a non-technical marketing manager would understand. Each under 20 words.

Respond with ONLY a JSON array of strings — no markdown, no commentary, no extra text.
Example of the exact format required:
["Conversion rate fell 35% this week versus last week","Mobile visitors tripled on Tuesday"]`;

    let alertTexts: string[] = [];
    try {
      const { parsed } = await generateJSON(prompt, { maxTokens: 1200 });
      alertTexts = generatedAlertsSchema.parse(parsed);
    } catch (parseErr) {
      console.error('[Anomaly Parse Error] Failed parsing JSON:', parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 502 });
    }

    // 5. Store alerts in anomaly_alerts Supabase table
    const alertRows = alertTexts.map((text) => {
      const lower = text.toLowerCase();
      let severity: 'info' | 'warning' | 'critical' = 'warning';

      if (lower.includes('conversion') || lower.includes('overall') || lower.includes('drop')) {
        severity = 'critical';
      } else if (lower.includes('new') || lower.includes('verify') || lower.includes('snippet') || lower.includes('install')) {
        severity = 'info';
      }

      return { client_id: clientId, alert_text: text, severity, read: false };
    });

    // One statement prevents a partially saved alert set from being returned
    // as a successful detection run.
    const { data: savedAlerts, error: saveError } = await supabaseAdmin
      .from('anomaly_alerts')
      .insert(alertRows)
      .select();
    if (saveError || !savedAlerts) {
      console.error('[Anomaly Save Error] Failed inserting alert set:', saveError);
      return NextResponse.json({ error: 'Unable to save anomaly alerts' }, { status: 500 });
    }

    // 6. Cache alerts array in Redis for 1 hour (3600 seconds)
    try {
      await redis.setex(cacheKey, 3600, JSON.stringify(savedAlerts));
    } catch (cacheSetErr) {
      console.error('[Anomaly Cache Write Error]:', cacheSetErr);
    }

    return NextResponse.json({ alerts: savedAlerts });

  } catch (error) {
    console.error('[Anomaly Exception] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// Reading alerts is side-effect free. Detection is POST-only because it calls
// the model and writes alerts; GET requests must remain safe and cacheable.
export async function GET(req: NextRequest) {
  return handleAnomalyRequest(req, false);
}

export async function POST(req: NextRequest) {
  return handleAnomalyRequest(req, true);
}

// PATCH handler: marks a specific alert as read
export async function PATCH(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readJson(req, alertPatchRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { id } = parsedBody.data;

    const { data, error } = await supabaseAdmin
      .from('anomaly_alerts')
      .update({ read: true })
      .eq('id', id)
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) {
      console.error('[Anomaly PATCH Error] Supabase update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invalidate anomaly run cache for this client so getClientId gets fresh data
    const cacheKey = `anomaly_alerts_run:${clientId}`;
    try {
      await redis.del(cacheKey);
    } catch (cacheDelErr) {
      console.error('[Anomaly Cache Clear Error]:', cacheDelErr);
    }

    return NextResponse.json({ success: true, alert: data });

  } catch (error) {
    console.error('[Anomaly PATCH Exception] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
