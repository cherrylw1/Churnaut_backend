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

    // Retrieve the connection token from the crm_tokens table
    const { data: tokenData, error } = await supabaseAdmin
      .from('crm_tokens')
      .select('access_token, connection_status, updated_at, created_at')
      .eq('client_id', clientId)
      .eq('crm_type', 'calendly')
      .maybeSingle();

    if (error) {
      console.error('[Calendly Status GET Error] Database error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!tokenData?.access_token || tokenData.connection_status === 'unhealthy') {
      return NextResponse.json({ connected: false, connected_at: null, reason: !tokenData ? 'missing_token' : tokenData.connection_status === 'unhealthy' ? 'refresh_failed' : 'invalid_token' });
    }

    const connectedAt = tokenData.updated_at || tokenData.created_at || null;

    return NextResponse.json({
      connected: true,
      connected_at: connectedAt,
    });
  } catch (err) {
    console.error('[Calendly Status GET Error] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: disconnectError } = await supabaseAdmin.rpc('disconnect_calendly', { client_id_input: clientId });
    if (disconnectError) {
      console.error('[Calendly Disconnect Error] Transaction failed:', disconnectError);
      return NextResponse.json({ error: 'Failed to disconnect Calendly' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Calendly Disconnect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
