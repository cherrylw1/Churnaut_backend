import { NextRequest, NextResponse } from 'next/server';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import { redis } from '@/lib/redis';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate user from session cookie
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      // Redirect unauthenticated requests to login page
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const pipedriveClientId = process.env.PIPEDRIVE_CLIENT_ID;
    if (!pipedriveClientId) {
      console.error('[Pipedrive OAuth Redirect Error] PIPEDRIVE_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Pipedrive integration is not configured on the server' }, { status: 500 });
    }

    // Generate dynamic state nonce and store in Redis with 10-minute TTL
    const nonce = crypto.randomUUID();
    await redis.setex(`oauth_state:${nonce}`, 600, clientId);

    // 3. Construct Pipedrive Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/pipedrive/callback';
    const scope = 'deals:read contacts:read users:read organizations:read';
    
    const pipedriveAuthUrl = `https://oauth.pipedrive.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(pipedriveClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(nonce)}`;

    // 4. Redirect to Pipedrive
    return NextResponse.redirect(pipedriveAuthUrl);
  } catch (err) {
    console.error('[Pipedrive OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
