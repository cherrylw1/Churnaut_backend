import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { clientDomainRequestSchema, readJson } from '@/lib/validation';
import { normalizeTrackedOrigin } from '@/lib/url';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, company_name, domain, plan, plan_status, monthly_visits, snippet_key, webhook_secret, crm_type, active, lemonsqueezy_customer_id')
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
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readJson(req, clientDomainRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { domain } = parsedBody.data;

    let normalizedDomain: string;
    try {
      normalizedDomain = normalizeTrackedOrigin(domain);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid domain' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc('set_primary_client_domain', {
      client_id_input: clientId,
      origin_input: normalizedDomain,
    });

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
