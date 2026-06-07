import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  try {
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, company_name, domain, plan, snippet_key, crm_type, active')
      .eq('id', clientId)
      .maybeSingle();

    if (error) {
      console.error('[GET Client Error] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!client) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    }

    return NextResponse.json({ client });
  } catch (err) {
    console.error('[GET Client Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    // Normalize domain — ensure it starts with https://
    let normalizedDomain = domain.trim();
    if (!normalizedDomain.startsWith('http://') && !normalizedDomain.startsWith('https://')) {
      normalizedDomain = 'https://' + normalizedDomain;
    }
    // Remove trailing slash
    normalizedDomain = normalizedDomain.replace(/\/$/, '');

    const { error } = await supabaseAdmin
      .from('clients')
      .update({ domain: normalizedDomain })
      .eq('id', clientId);

    if (error) {
      console.error('[PATCH Client Error] Failed to update domain:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, domain: normalizedDomain });
  } catch (err) {
    console.error('[PATCH Client Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
