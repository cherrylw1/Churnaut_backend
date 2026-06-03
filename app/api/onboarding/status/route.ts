import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [eventsRes, sessionsRes, rulesRes, clientRes] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabaseAdmin.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabaseAdmin.from('routing_rules').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabaseAdmin.from('clients').select('crm_type').eq('id', clientId).maybeSingle(),
  ]);

  return NextResponse.json({
    snippet_installed: (eventsRes.count ?? 0) > 0,
    first_link_created: (sessionsRes.count ?? 0) > 0,
    first_rule_created: (rulesRes.count ?? 0) > 0,
    crm_connected: !!(clientRes.data?.crm_type),
  });
}
