import { logError, logInfo } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClientId } from '@/lib/auth';
import { redis } from '@/lib/redis';
import crypto from 'crypto';
import { getAppOrigin } from '@/lib/app-origin';
import { stagingIntegrationsEnabled } from '@/lib/environment';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session cookie
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      logInfo('[Calendly OAuth Redirect Info] Unauthenticated request, redirecting to login');
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (!stagingIntegrationsEnabled()) return NextResponse.json({ error: 'External integrations are disabled in staging' }, { status: 403 });

    const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
    if (!calendlyClientId) {
      logError('[Calendly OAuth Redirect Error] CALENDLY_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Calendly integration is not configured on the server' }, { status: 500 });
    }

    // Generate dynamic state nonce and store in Redis with 10-minute TTL
    const nonce = crypto.randomUUID();
    await redis.setex(`oauth_state:${nonce}`, 600, clientId);

    // 3. Construct Calendly Authorization URL
    const redirectUri = `${getAppOrigin()}/api/oauth/calendly/callback`;
    
    const calendlyAuthUrl = `https://auth.calendly.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(calendlyClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(nonce)}`;

    logInfo('[Calendly OAuth Redirect Success] Redirecting client to Calendly');
    return NextResponse.redirect(calendlyAuthUrl);
  } catch (err) {
    logError('[Calendly OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
