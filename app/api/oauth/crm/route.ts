import { logError, logWarn } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { hasScoutAdapter } from '@/lib/scout/crm-adapters';
import { redis } from '@/lib/redis';
import { recordOpsEvent } from '@/lib/monitoring/events';

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
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('crm_tokens')
      .select('access_token, refresh_token, connection_status, last_error, updated_at, created_at')
      .eq('client_id', clientId)
      .eq('crm_type', client.crm_type)
      .maybeSingle();

    if (tokenError) {
      logError('[CRM Status GET Error] Token lookup failed:', tokenError);
      return NextResponse.json({ error: 'Unable to verify CRM connection' }, { status: 500 });
    }

    const connectedAt = tokenData ? (tokenData.updated_at || tokenData.created_at || null) : null;

    const supported = hasScoutAdapter(client.crm_type);
    const hasUsableToken = !!tokenData?.access_token && tokenData.connection_status !== 'unhealthy';
    return NextResponse.json({
      connected: hasUsableToken && supported,
      supported,
      crm_type: client.crm_type,
      connected_at: connectedAt,
      reason: !tokenData ? 'missing_token' : tokenData.connection_status === 'unhealthy' ? 'refresh_failed' : !hasUsableToken ? 'invalid_token' : !supported ? 'unsupported_provider' : null,
    });
  } catch (err) {
    logError('[CRM Status GET Error] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentClient, error: clientError } = await supabaseAdmin.from('clients').select('crm_type').eq('id', clientId).maybeSingle();
    if (clientError) {
      logError('[CRM Disconnect Error] Client lookup failed:', clientError);
      return NextResponse.json({ error: 'Unable to verify CRM connection' }, { status: 500 });
    }
    if (!currentClient) return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    const crmType = currentClient?.crm_type;

    if (!crmType) return NextResponse.json({ success: true });
    const { error: disconnectError } = await supabaseAdmin.rpc('disconnect_crm', {
      client_id_input: clientId,
      crm_type_input: crmType,
    });
    if (disconnectError) {
      logError('[CRM Disconnect Error] Transaction failed:', disconnectError);
      return NextResponse.json({ error: 'Failed to disconnect CRM' }, { status: 500 });
    }
    await Promise.all([
      redis.del(`scout:pipeline:${clientId}`),
      redis.del(`scout:pipeline_api:${clientId}`),
    ]).catch((error) => logWarn('[CRM Disconnect Warning] Cache clear failed:', error));
    await recordOpsEvent({ component: 'crm', eventCode: 'crm_reconnected', severity: 'info', clientId, metadata: { crm_type: crmType, status: 'disconnected' } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logError('[CRM Disconnect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
