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
      .select('updated_at, created_at')
      .eq('client_id', clientId)
      .eq('crm_type', 'calendly')
      .maybeSingle();

    if (error) {
      console.error('[Calendly Status GET Error] Database error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!tokenData) {
      return NextResponse.json({ connected: false, connected_at: null });
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

    // 1. Reset Calendly token column in clients table
    const { error: clientUpdateError } = await supabaseAdmin
      .from('clients')
      .update({
        calendly_token: null,
      })
      .eq('id', clientId);

    if (clientUpdateError) {
      console.error('[Calendly Disconnect Error] Client update failed:', clientUpdateError);
      return NextResponse.json({ error: 'Failed to disconnect Calendly from client profile' }, { status: 500 });
    }

    // 2. Clear token storage from crm_tokens where crm_type is 'calendly'
    const { error: tokenDeleteError } = await supabaseAdmin
      .from('crm_tokens')
      .delete()
      .eq('client_id', clientId)
      .eq('crm_type', 'calendly');

    if (tokenDeleteError) {
      console.warn('[Calendly Disconnect Warning] Token delete failed:', tokenDeleteError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Calendly Disconnect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
