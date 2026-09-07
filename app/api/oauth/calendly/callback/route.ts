import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // State contains Churnaut client's dynamic nonce

  if (!code || !state) {
    console.error('[Calendly OAuth Callback Error] Missing code or state parameters');
    return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_parameters', req.url));
  }

  // 1. Verify and consume the state nonce from Redis
  const redisKey = `oauth_state:${state}`;
  const clientId = await redis.getdel<string>(redisKey);
  if (!clientId) {
    console.error('[Calendly OAuth Callback Error] Invalid or expired state nonce');
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url));
  }

  try {
    const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
    const calendlyClientSecret = process.env.CALENDLY_CLIENT_SECRET;

    if (!calendlyClientId || !calendlyClientSecret) {
      console.error('[Calendly OAuth Callback Error] Calendly credentials are not configured in environment');
      return NextResponse.redirect(new URL('/dashboard/integrations?error=server_configuration_error', req.url));
    }

    // 2. Exchange OAuth code for access and refresh tokens
    const tokenUrl = 'https://auth.calendly.com/oauth/token';
    const redirectUri = 'https://app.churnaut.com/api/oauth/calendly/callback';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: calendlyClientId,
        client_secret: calendlyClientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[Calendly OAuth Callback Error] Token exchange failed with status:', tokenResponse.status);
      return NextResponse.redirect(
        new URL('/dashboard/integrations?error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('[Calendly OAuth Callback Error] Token exchange response missing tokens');
      return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_tokens', req.url));
    }

    // 3. Encrypt the tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;
    const { error: oauthError } = await supabaseAdmin.rpc('complete_calendly_oauth', {
      client_id_input: clientId,
      access_token_input: encryptedAccessToken,
      refresh_token_input: encryptedRefreshToken,
      expires_at_input: expiresAt,
    });
    if (oauthError) {
      console.error('[Calendly OAuth Callback Error] Transaction failed:', oauthError);
      return NextResponse.redirect(new URL('/dashboard/integrations?error=token_storage_failed', req.url));
    }

    console.log('[Calendly OAuth Callback Success] Successfully authenticated and stored tokens');
    // 6. Redirect to settings page with connected flag
    return NextResponse.redirect(new URL('/dashboard/integrations/calendly?connected=true', req.url));
  } catch (err) {
    console.error('[Calendly OAuth Callback Exception] Unhandled callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations?error=internal_server_error', req.url));
  }
}
