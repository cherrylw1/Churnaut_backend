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

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const { deal_id, deal_name, rep_email, rep_name, message } = await req.json();

    // 3. Insert nudge record in scout_nudges table
    const { data, error } = await supabaseAdmin
      .from('scout_nudges')
      .insert({
        client_id: clientId,
        deal_id: deal_id || null,
        deal_name: deal_name || null,
        rep_email: rep_email || '',
        rep_name: rep_name || '',
        message: message || '',
        sent: true,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Scout Nudge POST] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, nudge: data });

  } catch (error) {
    console.error('[Scout Nudge POST Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
