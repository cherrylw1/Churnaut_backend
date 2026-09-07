import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ratelimit } from '@/lib/redis';
import { isRegisteredClientOrigin } from '@/lib/domain-access';
import { readJson, snippetPingRequestSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await readJson(req, snippetPingRequestSchema);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const clientId = parsed.data.client_id;
    const { data: client } = await supabaseAdmin.from('clients').select('id').eq('snippet_key', clientId).maybeSingle();
    if (!client) return json({ error: 'Unknown client' }, 401);
    if (!(await isRegisteredClientOrigin(client.id, req.headers.get('origin')))) return json({ error: 'Unregistered website origin' }, 403);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    try {
      const { success } = await ratelimit.limit(`snippet-ping:${client.id}:${ip}`);
      if (!success) return json({ error: 'Rate limit exceeded' }, 429);
    } catch (error) {
      console.warn('[Snippet Ping] Rate limit unavailable:', error);
    }
    const { error } = await supabaseAdmin.rpc('record_snippet_ping', { client_id_input: client.id });
    if (error) return json({ error: 'Unable to record snippet ping' }, 503);
    return json({ ok: true });
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
}
