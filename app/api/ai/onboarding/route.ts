import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

interface IncomingRule {
  priority: number;
  active?: boolean;
  signal_type?: string | null;
  conditions?: Record<string, string>;
  action_type: string;
  action_payload?: Record<string, unknown>;
  target_selector?: string;
  variant_content?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Answers
    const body = await req.json();
    const { crm, ideal_customer, company_size, channels, problem } = body;

    // 3. Call Gemini 2.5 Flash-Lite to Generate Routing Rules
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

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
    - action_payload: jsonb (e.g., {"calendar_url": "https://calendly.com/meeting"} or {"variant_content": "custom copy"})
    - target_selector: text (e.g., '.sr-target' or '#cta-button')
    - variant_content: text (the personalized headline or copy, e.g., 'Personalized copy swaps for {{ company_name }}')

    Generate exactly 3 highly relevant and helpful rules in priority order based on their profile. E.g., if they use Cold Email, signal_type should be 'Cold Email'. If they sell to large companies, target executives.
    Return ONLY a JSON array. No markdown, no preambles, no explanation.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[Onboarding Gemini Error] API returned status:', geminiRes.status, errText);
      return NextResponse.json({ error: 'Failed to generate onboarding rules via AI' }, { status: 502 });
    }

    const resData = await geminiRes.json();
    const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error('[Onboarding Gemini Error] Empty response structure:', JSON.stringify(resData));
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
      if (!Array.isArray(rules)) {
        throw new Error('Parsed result is not an array');
      }
    } catch (parseErr) {
      console.error('[Onboarding Rule Parse Error] Failed to parse JSON list:', cleanedText, parseErr);
      return NextResponse.json({ error: 'AI generated invalid routing rule structure' }, { status: 502 });
    }

    // 5. Delete existing rules for this client to start clean
    const { error: deleteErr } = await supabaseAdmin
      .from('routing_rules')
      .delete()
      .eq('client_id', clientId);

    if (deleteErr) {
      console.error('[Onboarding DB Error] Failed to clear existing rules:', deleteErr);
      return NextResponse.json({ error: `Database clear failed: ${deleteErr.message}` }, { status: 500 });
    }

    // 6. Map and Insert generated rules
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

    const { error: insertErr } = await supabaseAdmin
      .from('routing_rules')
      .insert(insertPayload);

    if (insertErr) {
      console.error('[Onboarding DB Error] Failed to insert rules:', insertErr);
      return NextResponse.json({ error: `Database save failed: ${insertErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: insertPayload.length });

  } catch (err) {
    console.error('[Onboarding Exception] Unhandled error:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
