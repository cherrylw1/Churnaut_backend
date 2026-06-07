import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { generateText } from '@/lib/llm/complete';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET handler: either runs anomaly detection (if run=true) or fetches unread alerts
export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const runDetection = searchParams.get('run') === 'true' || searchParams.get('action') === 'run';

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

    // 2. Query analytics events in the last 7 days
    const { data: events, error: eventsErr } = await supabaseAdmin
      .from('analytics_events')
      .select('created_at, rule_id, event_type')
      .eq('client_id', clientId)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (eventsErr) {
      console.error('[Anomaly Detection Error] Fetching events failed:', eventsErr);
      return NextResponse.json({ error: eventsErr.message }, { status: 500 });
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

    for (const event of events || []) {
      if (event.event_type === 'rule_triggered' && event.rule_id) {
        const day = event.created_at.split('T')[0];
        if (ruleDailyTriggers[event.rule_id] && ruleDailyTriggers[event.rule_id][day] !== undefined) {
          ruleDailyTriggers[event.rule_id][day]++;
        }
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

    // 3. Compare overall conversion rate drops (last 3 days vs previous 4 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from('sessions')
      .select('created_at, converted')
      .eq('client_id', clientId)
      .gte('created_at', fourteenDaysAgo.toISOString());

    if (sessionsErr) {
      console.error('[Anomaly Detection Error] Fetching sessions failed:', sessionsErr);
    }

    if (sessions && sessions.length > 0) {
      const thisWeekSessions = sessions.filter(s => new Date(s.created_at) >= sevenDaysAgo);
      const prevWeekSessions = sessions.filter(s => new Date(s.created_at) < sevenDaysAgo);

      const thisWeekConverted = thisWeekSessions.filter(s => s.converted).length;
      const thisWeekTotal = thisWeekSessions.length;
      const thisWeekRate = thisWeekTotal > 0 ? thisWeekConverted / thisWeekTotal : 0;

      const prevWeekConverted = prevWeekSessions.filter(s => s.converted).length;
      const prevWeekTotal = prevWeekSessions.length;
      const prevWeekRate = prevWeekTotal > 0 ? prevWeekConverted / prevWeekTotal : 0;

      if (prevWeekRate > 0) {
        const convDrop = (prevWeekRate - thisWeekRate) / prevWeekRate;
        if (convDrop > 0.40) {
          anomalies.push('Overall conversion rate dropped significantly this week');
        }
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

    const geminiPrompt = `You are a B2B SaaS performance analyst. Here are anomalies detected in a website personalization system:
${anomalies.map(a => `- ${a}`).join('\n')}

Write 1-3 short, plain-English alert messages a non-technical marketing manager would understand. Each under 20 words. Output only a JSON array of strings. Do not wrap in markdown or explanation.`;

    const rawText = (await generateText(geminiPrompt, { maxTokens: 1200 })) || '[]';

    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let alertTexts: string[] = [];
    try {
      alertTexts = JSON.parse(cleanedText);
      if (!Array.isArray(alertTexts)) {
        throw new Error('Response is not a JSON array');
      }
    } catch (parseErr) {
      console.error('[Anomaly Parse Error] Failed parsing JSON:', cleanedText, parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 502 });
    }

    // 5. Store alerts in anomaly_alerts Supabase table
    const savedAlerts = [];
    for (const text of alertTexts) {
      const lower = text.toLowerCase();
      let severity: 'info' | 'warning' | 'critical' = 'warning';

      if (lower.includes('conversion') || lower.includes('overall') || lower.includes('drop')) {
        severity = 'critical';
      } else if (lower.includes('new') || lower.includes('verify') || lower.includes('snippet') || lower.includes('install')) {
        severity = 'info';
      }

      const { data, error } = await supabaseAdmin
        .from('anomaly_alerts')
        .insert({
          client_id: clientId,
          alert_text: text,
          severity,
          read: false,
        })
        .select()
        .single();

      if (!error && data) {
        savedAlerts.push(data);
      } else {
        console.error('[Anomaly Save Error] Failed inserting alert:', error);
      }
    }

    // 6. Cache alerts array in Redis for 1 hour (3600 seconds)
    try {
      await redis.setex(cacheKey, 3600, JSON.stringify(savedAlerts));
    } catch (cacheSetErr) {
      console.error('[Anomaly Cache Write Error]:', cacheSetErr);
    }

    return NextResponse.json({ alerts: savedAlerts });

  } catch (error) {
    console.error('[Anomaly GET Exception] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// PATCH handler: marks a specific alert as read
export async function PATCH(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing alert ID' }, { status: 400 });
    }

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
