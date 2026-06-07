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

    const zohoClientId = process.env.ZOHO_CLIENT_ID;
    if (!zohoClientId) {
      console.error('[Zoho OAuth Redirect Error] ZOHO_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Zoho integration is not configured on the server' }, { status: 500 });
    }

    // Generate dynamic state nonce and store in Redis with 10-minute TTL
    const nonce = crypto.randomUUID();
    await redis.setex(`oauth_state:${nonce}`, 600, clientId);

    // 3. Construct Zoho Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/zoho/callback';
    const scope = 'ZohoCRM.modules.deals.READ ZohoCRM.modules.contacts.READ ZohoCRM.modules.leads.READ ZohoCRM.users.READ';
    
    const zohoAuthUrl = `https://accounts.zoho.com/oauth/v2/auth` +
      `?client_id=${encodeURIComponent(zohoClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(nonce)}`;

    // 4. Redirect to Zoho
    return NextResponse.redirect(zohoAuthUrl);
  } catch (err) {
    console.error('[Zoho OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
