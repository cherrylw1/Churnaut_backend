import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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
    // 1. Authenticate user from session cookie
    const clientId = getClientId(req);
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
      console.error('[Hubspot OAuth Redirect Error] Client lookup failed:', error);
      return NextResponse.json({ error: 'Client profile not found or invalid session' }, { status: 404 });
    }

    const hubspotClientId = process.env.HUBSPOT_CLIENT_ID;
    if (!hubspotClientId) {
      console.error('[Hubspot OAuth Redirect Error] HUBSPOT_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'HubSpot integration is not configured on the server' }, { status: 500 });
    }

    // 3. Construct HubSpot Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/hubspot/callback';
    const scope = 'crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read crm.objects.owners.read';
    
    const hubspotAuthUrl = `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(hubspotClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(client.snippet_key)}`;

    // 4. Redirect to HubSpot
    return NextResponse.redirect(hubspotAuthUrl);
  } catch (err) {
    console.error('[Hubspot OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
