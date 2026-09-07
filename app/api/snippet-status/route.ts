import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Installation is proven by the explicit snippet heartbeat, never by a
    // webhook or arbitrary analytics event.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString();

    const { data: client, error: queryErr } = await supabaseAdmin
      .from('clients')
      .select('last_snippet_ping_at')
      .eq('id', clientId)
      .maybeSingle();

    if (queryErr) {
      console.error('[GET Snippet Status Error] Database query failed:', queryErr);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    // 4. Return status
    if (client?.last_snippet_ping_at && client.last_snippet_ping_at >= yesterdayISO) {
      return NextResponse.json({
        active: true,
        lastPing: client.last_snippet_ping_at,
      });
    } else {
      return NextResponse.json({
        active: false,
      });
    }

  } catch (err) {
    console.error('[GET Snippet Status Exception] Unhandled error:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
