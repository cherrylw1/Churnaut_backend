import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClientId } from '@/lib/auth';
import { redis } from '@/lib/redis';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session cookie
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      // Redirect unauthenticated requests to login page
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const hubspotClientId = process.env.HUBSPOT_CLIENT_ID;
    if (!hubspotClientId) {
      console.error('[Hubspot OAuth Redirect Error] HUBSPOT_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'HubSpot integration is not configured on the server' }, { status: 500 });
    }

    // Generate dynamic state nonce and store in Redis with 10-minute TTL
    const nonce = crypto.randomUUID();
    await redis.setex(`oauth_state:${nonce}`, 600, clientId);

    // 3. Construct HubSpot Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/hubspot/callback';
    const scope = 'crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read crm.objects.owners.read';
    
    const hubspotAuthUrl = `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(hubspotClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(nonce)}`;

    // 4. Redirect to HubSpot
    return NextResponse.redirect(hubspotAuthUrl);
  } catch (err) {
    console.error('[Hubspot OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
