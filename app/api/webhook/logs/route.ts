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
      .select('*')
      .eq('client_id', clientId)
      .eq('event_type', 'webhook')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.error('[GET Webhook Logs Error] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (err) {
    console.error('[GET Webhook Logs Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
