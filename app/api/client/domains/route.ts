import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { normalizeTrackedOrigin } from '@/lib/url';
import { clientDomainRequestSchema, readJson } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabaseAdmin.from('client_domains').select('*').eq('client_id', clientId).order('is_primary', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ domains: data || [] });
}

export async function POST(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = await readJson(req, clientDomainRequestSchema);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const domain = normalizeTrackedOrigin(parsed.data.domain);
    const { data, error } = await supabaseAdmin.rpc('add_client_domain', { client_id_input: clientId, origin_input: domain, hostname_input: new URL(domain).hostname });
    if (error) {
      const limitReached = /domain limit/i.test(error.message);
      return NextResponse.json({ error: limitReached ? 'Domain limit reached for your plan' : error.message, code: limitReached ? 'domain_limit' : 'domain_error' }, { status: limitReached ? 403 : 400 });
    }
    return NextResponse.json({ domain: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid domain' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'A valid domain id is required' }, { status: 400 });
  const { error } = await supabaseAdmin.rpc('remove_client_domain', { client_id_input: clientId, domain_id_input: id });
  if (error) {
    const userError = /final domain|not found/i.test(error.message);
    return NextResponse.json({ error: userError ? error.message : 'Failed to remove domain' }, { status: userError ? 400 : 500 });
  }
  return NextResponse.json({ success: true });
}
