import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [clientRes, sessionsRes, rulesRes, crmRes, ruleTriggeredRes] = await Promise.all([
    supabaseAdmin.from('clients').select('last_snippet_ping_at, crm_type').eq('id', clientId).maybeSingle(),
    supabaseAdmin.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('session_kind', 'tracked_link'),
    supabaseAdmin.from('routing_rules').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabaseAdmin.from('crm_tokens').select('crm_type, access_token, connection_status').eq('client_id', clientId),
    supabaseAdmin.from('analytics_events').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('event_type', 'rule_triggered'),
  ]);

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const snippetInstalled = !!clientRes.data?.last_snippet_ping_at && Date.parse(clientRes.data.last_snippet_ping_at) >= cutoff;
  const crmConnected = !!clientRes.data?.crm_type && (crmRes.data || []).some((token) => token.crm_type === clientRes.data?.crm_type && !!token.access_token && token.connection_status !== 'unhealthy');
  return NextResponse.json({
    snippet_installed: snippetInstalled,
    first_link_created: (sessionsRes.count ?? 0) > 0,
    first_rule_created: (rulesRes.count ?? 0) > 0,
    crm_connected: crmConnected,
    first_personalized_visit: (ruleTriggeredRes.count ?? 0) > 0,
  });
}
