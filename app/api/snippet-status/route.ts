import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Helper to extract authenticated client_id from cookie session
function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Compute 24-hour threshold
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString();

    // 3. Query analytics_events for recent pings
    const { data: recentEvent, error: queryErr } = await supabaseAdmin
      .from('analytics_events')
      .select('created_at')
      .eq('client_id', clientId)
      .gte('created_at', yesterdayISO)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryErr) {
      console.error('[GET Snippet Status Error] Database query failed:', queryErr);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    // 4. Return status
    if (recentEvent) {
      return NextResponse.json({
        active: true,
        lastPing: recentEvent.created_at,
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
