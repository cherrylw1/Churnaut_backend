import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ratelimit } from '@/lib/redis';
import { evaluateRules } from '@/lib/rules-engine';
import { Session } from '@/types/index';

// CORS headers configuration helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS Preflight Options
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Parse request body and get client_id, sid fields
    const body = await req.json();
    const { client_id: clientIdParam, sid } = body;

    if (!clientIdParam) {
      return NextResponse.json(
        { error: 'Missing client_id parameter' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. Look up the client in the clients table by snippet_key matching client_id
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('snippet_key', clientIdParam)
      .maybeSingle();

    if (clientError || !clientData) {
      console.error('[Resolve Error] Client lookup failed for key:', clientIdParam, clientError);
      return NextResponse.json(
        { error: 'Unauthorized: invalid client key' },
        { status: 401, headers: corsHeaders }
      );
    }

    const client_id = clientData.id;

    // Rate limiting
    try {
      const { success } = await ratelimit.limit(client_id);
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: corsHeaders }
        );
      }
    } catch (rlError) {
      console.error('[RateLimit Error] Failed to enforce rate limiting:', rlError);
    }

    // 3. Look up the session in the sessions table by id matching sid
    let session: Session | null = null;
    if (sid) {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', sid)
        .eq('client_id', client_id)
        .maybeSingle();

      if (!error) {
        session = data;
      }
    }

    // 4. Fetch all active routing rules for the client ordered by priority ascending
    const { data: rulesData, error: rulesError } = await supabaseAdmin
      .from('routing_rules')
      .select('*')
      .eq('client_id', client_id)
      .eq('active', true)
      .order('priority', { ascending: true });

    if (rulesError) {
      console.error('[Resolve Error] Rules lookup failed:', rulesError);
    }

    const rules = rulesData || [];

    // 5. Call evaluateRules with the session and rules
    const matchedRule = evaluateRules(session, rules);

    // 6. If matchedRule is null or matchedRule.target_selector is null, return JSON: {visitor_token: null, swaps: []}
    if (!matchedRule || matchedRule.target_selector === null || matchedRule.target_selector === undefined) {
      return NextResponse.json(
        { visitor_token: null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    // 7. Build one swap: {selector: matchedRule.target_selector, content: matchedRule.variant_content}
    let content = matchedRule.variant_content || '';
    if (matchedRule.action_type === 'show_calendar') {
      const calendarUrl = matchedRule.action_payload?.calendar_url || session?.calendar_url || '';
      content = `<iframe src="${calendarUrl}" width="100%" height="100%" frameborder="0"></iframe>`;
    }

    const swap = {
      selector: matchedRule.target_selector,
      content: content,
    };

    // 8. Return JSON: {visitor_token: session?.visitor_token, swaps: [the swap object]}
    const visitor_token = session?.visitor_token || null;

    return NextResponse.json(
      {
        visitor_token,
        swaps: [swap],
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('[Resolve Error] Unhandled exception occurred:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500, headers: corsHeaders }
    );
  }
}
