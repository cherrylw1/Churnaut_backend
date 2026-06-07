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
    console.error('[Zoho OAuth Callback Error] Missing code or state parameters');
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_parameters', req.url));
  }

  // 1. Verify and consume the state nonce from Redis
  const redisKey = `oauth_state:${state}`;
  const clientId = await redis.get(redisKey);
  if (!clientId) {
    console.error('[Zoho OAuth Callback Error] Invalid or expired state nonce');
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=invalid_state', req.url));
  }
  await redis.del(redisKey); // Consume it immediately

  try {
    const zohoClientId = process.env.ZOHO_CLIENT_ID;
    const zohoClientSecret = process.env.ZOHO_CLIENT_SECRET;

    if (!zohoClientId || !zohoClientSecret) {
      console.error('[Zoho OAuth Callback Error] Zoho credentials are not configured in environment');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=server_configuration_error', req.url));
    }

    // 2. Exchange OAuth code for access and refresh tokens
    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    const redirectUri = 'https://app.churnaut.com/api/oauth/zoho/callback';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: zohoClientId,
        client_secret: zohoClientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[Zoho OAuth Callback Error] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/dashboard/integrations/crm?error=token_exchange_failed', req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      console.error('[Zoho OAuth Callback Error] Token exchange response missing access token');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_tokens', req.url));
    }

    // 3. Encrypt the tokens
    const encryptedAccessToken = encrypt(access_token);
    // Zoho offline grant types return refresh_token on the first authorize prompt only.
    // If not returned in this specific callback response, we keep it as null or don't overwrite.
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;

    // 4. Update the clients table row
    // Build update payload
    const updatePayload: Record<string, string> = {
      crm_type: 'zoho',
    };

    if (encryptedRefreshToken) {
      updatePayload.crm_api_key = JSON.stringify({
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
      });
    } else {
      updatePayload.crm_api_key = JSON.stringify({
        access_token: encryptedAccessToken,
      });
    }

    const { error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update(updatePayload)
      .eq('id', clientId);

    if (updateClientError) {
      console.error('[Zoho OAuth Callback Error] Failed to update client record:', updateClientError);
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=database_update_failed', req.url));
    }

    // 5. Store/upsert the tokens in crm_tokens table
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { data: existingToken, error: tokenSelectError } = await supabaseAdmin
      .from('crm_tokens')
      .select('id, refresh_token')
      .eq('client_id', clientId)
      .eq('crm_type', 'zoho')
      .maybeSingle();

    if (!tokenSelectError) {
      if (existingToken) {
        // Update existing record, preserving old refresh token if no new one was provided
        const updateTokenPayload: Record<string, string | null> = {
          access_token: encryptedAccessToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        };
        if (encryptedRefreshToken) {
          updateTokenPayload.refresh_token = encryptedRefreshToken;
        }

        const { error: updateTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .update(updateTokenPayload)
          .eq('id', existingToken.id);
        
        if (updateTokenError) {
          console.error('[Zoho OAuth Callback Warning] Failed to update crm_tokens row:', updateTokenError);
        }
      } else {
        // Insert new record
        const { error: insertTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .insert({
            client_id: clientId,
            crm_type: 'zoho',
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken || '',
            expires_at: expiresAt,
          });

        if (insertTokenError) {
          console.error('[Zoho OAuth Callback Warning] Failed to insert crm_tokens row:', insertTokenError);
        }
      }
    } else {
      console.error('[Zoho OAuth Callback Warning] Error checking existing token row in crm_tokens:', tokenSelectError);
    }

    // 6. Redirect to integrations page with connected flag
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?connected=zoho', req.url));
  } catch (err) {
    console.error('[Zoho OAuth Callback Exception] Unhandled callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=internal_server_error', req.url));
  }
}
