import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: logs, error } = await supabaseAdmin
      .from('analytics_events')
      .select('id, created_at, event_type, signal_type, metadata')
      .eq('client_id', clientId)
      .eq('event_type', 'webhook_received')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      logError('[GET Webhook Logs Error] Database error:', error);
      return NextResponse.json({ error: 'Unable to load webhook logs' }, { status: 500 });
    }

    const safeLogs = (logs || []).map((log) => ({
      ...log,
      metadata: {
        schema_version: log.metadata?.schema_version,
        webhook_action: log.metadata?.webhook_action,
        webhook_auth_method: log.metadata?.webhook_auth_method,
        payload_key_count: Number(log.metadata?.payload_key_count || 0),
        transformed_field_count: Number(log.metadata?.transformed_field_count || 0),
        result_category: typeof log.metadata?.result_category === 'string' ? log.metadata.result_category : 'unknown',
      },
    }));
    return NextResponse.json({ logs: safeLogs });
  } catch (err) {
    logError('[GET Webhook Logs Exception] Unhandled exception:', err);
    return NextResponse.json({ error: 'Unable to load webhook logs' }, { status: 500 });
  }
}
