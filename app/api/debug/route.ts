import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { evaluateRules } from '@/lib/rules-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const snippetKey = searchParams.get('snippet_key');
    const sid = searchParams.get('sid');

    if (!snippetKey) {
      return NextResponse.json({ error: 'Missing snippet_key query parameter' }, { status: 400 });
    }

    // 1. Look up client by snippet_key in the clients table
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, company_name, domain, snippet_key')
      .eq('snippet_key', snippetKey)
      .maybeSingle();

    if (clientError) {
      return NextResponse.json({ error: 'Client lookup query failed', details: clientError.message }, { status: 500 });
    }

    if (!clientData) {
      return NextResponse.json({ error: 'Client not found for snippet_key' }, { status: 404 });
    }

    const clientId = clientData.id;

    // 2. Look up session by sid in the sessions table
    let sessionData = null;
    if (sid) {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', sid)
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: 'Session query failed', details: error.message }, { status: 500 });
      }
      sessionData = data;
    }

    // 3. Fetch all active routing rules for that client
    const { data: rulesData, error: rulesError } = await supabaseAdmin
      .from('routing_rules')
      .select('*')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('priority', { ascending: true });

    if (rulesError) {
      return NextResponse.json({ error: 'Routing rules query failed', details: rulesError.message }, { status: 500 });
    }

    const rules = rulesData || [];

    // 4. Call evaluateRules with the session and rules
    const matchedRule = evaluateRules(sessionData, rules);

    // 5. Return all results as a single JSON object
    return NextResponse.json({
      client: clientData,
      session: sessionData,
      rules,
      matchedRule,
    });

  } catch (err) {
    console.error('[Debug Endpoint Error] Unhandled exception occurred:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
