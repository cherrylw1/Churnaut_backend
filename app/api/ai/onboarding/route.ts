import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { generateText } from '@/lib/llm/complete';
import { generatedRuleSchema, onboardingRequestSchema, readJson } from '@/lib/validation';

export const dynamic = 'force-dynamic';


interface IncomingRule {
  priority: number;
  active?: boolean;
  signal_type?: string | null;
  conditions?: Record<string, unknown>;
  action_type: string;
  action_payload?: Record<string, unknown>;
  target_selector?: string | null;
  variant_content?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Answers
    const parsedBody = await readJson(req, onboardingRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { crm, ideal_customer, company_size, channels, problem } = parsedBody.data;

    // 3. Call Together AI to Generate Routing Rules
    const prompt = `You are Churnaut's AI Assistant. Generate a set of routing rules (JSON array of objects) for a B2B client based on their onboarding profile.
    Client profile:
    - CRM: ${crm || 'None'}
    - Ideal Customer: ${ideal_customer || 'B2B Buyers'}
    - Target Company Size: ${company_size || 'All'}
    - Outbound Channels: ${JSON.stringify(channels || [])}
    - Main Problem: ${problem || 'Conversions'}

    Return a JSON array of objects conforming to this database schema:
    - priority: integer (starting from 1, unique and sequential, i.e., 1, 2, 3)
    - active: true
    - signal_type: text (Must be one of: 'Cold Email', 'LinkedIn Ad', 'Google Ad', 'QR Code', 'G2 Referral', 'Webinar Follow-up', 'Partner Referral', 'Conference QR Code', 'Returning Visitor', 'Other', or null for any signal)
    - conditions: jsonb (e.g., {"job_title_contains": "CEO"} or {"company_name_equals": "Acme"} or {} for any visitor)
    - action_type: 'show_calendar' or 'inject_copy'
    - action_payload: jsonb. For show_calendar use {"calendar_url": "https://calendly.com/meeting"}; for inject_copy use {"swaps": [{"selector": "h1", "content": "Personalized copy"}]}
    - target_selector: text (e.g., '.sr-target' or '#cta-button')
    - variant_content: text (the personalized headline or copy, e.g., 'Personalized copy swaps for {{ company_name }}')

    Generate exactly 3 highly relevant and helpful rules in priority order based on their profile. E.g., if they use Cold Email, signal_type should be 'Cold Email'. If they sell to large companies, target executives.
    Return ONLY a JSON array. No markdown, no preambles, no explanation.`;

    let rawText: string;
    try { rawText = await generateText(prompt, { maxTokens: 1500, context: { feature: 'onboarding_rules', scope: 'customer', clientId } }); }
    catch (error) { logError('[Onboarding AI] unavailable:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ success: false, degraded: true, error: 'ai_unavailable', canContinueManually: true }); }

    if (!rawText) {
      logError('[Onboarding Error] Empty response structure');
      return NextResponse.json({ error: 'Invalid response from AI model' }, { status: 502 });
    }

    // 4. Clean Markdown block indicators
    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let rules: IncomingRule[] = [];
    try {
      rules = JSON.parse(cleanedText);
      if (!Array.isArray(rules) || rules.length === 0 || rules.length > 50) {
        throw new Error('Parsed result is not an array');
      }
      rules = rules.map((rule) => generatedRuleSchema.parse(rule));
      const priorities = rules.map((rule) => rule.priority);
      if (new Set(priorities).size !== priorities.length) throw new Error('Rule priorities must be unique');
    } catch (parseErr) {
      logError('[Onboarding Rule Parse Error] Failed to validate generated rules:', parseErr);
      return NextResponse.json({ error: 'AI generated invalid routing rule structure' }, { status: 502 });
    }

    // 5. Replace rules transactionally inside Postgres so a failed insert
    // cannot leave the customer with an empty rule set.
    const insertPayload = rules.map((r, index) => ({
      client_id: clientId,
      priority: r.priority || (index + 1),
      active: r.active !== undefined ? r.active : true,
      signal_type: r.signal_type || null,
      conditions: r.conditions || {},
      action_type: r.action_type || 'inject_copy',
      action_payload: r.action_payload || {},
      target_selector: r.target_selector || '.sr-target',
      variant_content: r.variant_content || '',
    }));

    const { data: replacedCount, error: insertErr } = await supabaseAdmin.rpc('replace_routing_rules', {
      client_id_input: clientId,
      rules_input: insertPayload,
    });

    if (insertErr) {
      logError('[Onboarding DB Error] Failed to insert rules:', insertErr);
      return NextResponse.json({ error: `Database save failed: ${insertErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: replacedCount ?? insertPayload.length });

  } catch (err) {
    logError('[Onboarding Exception] Unhandled error:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
