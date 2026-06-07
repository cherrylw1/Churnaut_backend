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

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('crm_type')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    }

    if (!client.crm_type) {
      return NextResponse.json({ connected: false, crm_type: null, connected_at: null });
    }

    // Retrieve the connection date from the crm_tokens table
    const { data: tokenData } = await supabaseAdmin
      .from('crm_tokens')
      .select('updated_at, created_at')
      .eq('client_id', clientId)
      .eq('crm_type', client.crm_type)
      .maybeSingle();

    const connectedAt = tokenData ? (tokenData.updated_at || tokenData.created_at || null) : null;

    return NextResponse.json({
      connected: true,
      crm_type: client.crm_type,
      connected_at: connectedAt,
    });
  } catch (err) {
    console.error('[CRM Status GET Error] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Reset CRM columns in clients table
    const { error: clientUpdateError } = await supabaseAdmin
      .from('clients')
      .update({
        crm_type: null,
        crm_api_key: null,
      })
      .eq('id', clientId);

    if (clientUpdateError) {
      console.error('[CRM Disconnect Error] Client update failed:', clientUpdateError);
      return NextResponse.json({ error: 'Failed to disconnect CRM from client profile' }, { status: 500 });
    }

    // 2. Clear token storage from crm_tokens
    const { error: tokenDeleteError } = await supabaseAdmin
      .from('crm_tokens')
      .delete()
      .eq('client_id', clientId);

    if (tokenDeleteError) {
      console.warn('[CRM Disconnect Warning] Token delete failed:', tokenDeleteError);
      // We don't return an error here since the client profile's crm_type was reset successfully
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[CRM Disconnect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
