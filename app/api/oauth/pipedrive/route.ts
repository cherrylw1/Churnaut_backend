import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientPlan, planGate } from '@/lib/gate';
import { getVerifiedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate user from session cookie
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      // Redirect unauthenticated requests to login page
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // 2. Fetch the client's snippet_key to pass as state parameter
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('snippet_key')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !client || !client.snippet_key) {
      console.error('[Pipedrive OAuth Redirect Error] Client lookup failed:', error);
      return NextResponse.json({ error: 'Client profile not found or invalid session' }, { status: 404 });
    }

    const pipedriveClientId = process.env.PIPEDRIVE_CLIENT_ID;
    if (!pipedriveClientId) {
      console.error('[Pipedrive OAuth Redirect Error] PIPEDRIVE_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Pipedrive integration is not configured on the server' }, { status: 500 });
    }

    // 3. Construct Pipedrive Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/pipedrive/callback';
    const scope = 'deals:read contacts:read users:read organizations:read';
    
    const pipedriveAuthUrl = `https://oauth.pipedrive.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(pipedriveClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(client.snippet_key)}`;

    // 4. Redirect to Pipedrive
    return NextResponse.redirect(pipedriveAuthUrl);
  } catch (err) {
    console.error('[Pipedrive OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
