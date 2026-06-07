import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { getVerifiedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    console.error('[Close OAuth Callback Error] Missing code parameter');
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_parameters', req.url));
  }

  try {
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      console.error('[Close OAuth Callback Error] Client ID not found in session cookie');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=client_not_found', req.url));
    }

    const closeClientId = process.env.CLOSE_CLIENT_ID;
    const closeClientSecret = process.env.CLOSE_CLIENT_SECRET;

    if (!closeClientId || !closeClientSecret) {
      console.error('[Close OAuth Callback Error] Close credentials are not configured in environment');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=server_configuration_error', req.url));
    }

    // 1. Exchange OAuth code for access and refresh tokens
    const tokenUrl = 'https://api.close.com/oauth2/token/';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${closeClientId}:${closeClientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[Close OAuth Callback Error] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL(`/dashboard/integrations/crm?error=token_exchange_failed&details=${encodeURIComponent(JSON.stringify(errorData))}`, req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      console.error('[Close OAuth Callback Error] Token exchange response missing access token');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_tokens', req.url));
    }

    // 2. Encrypt the tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;

    // 3. Update the clients table row
    const updatePayload: Record<string, string> = {
      crm_type: 'close',
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
      console.error('[Close OAuth Callback Error] Failed to update client record:', updateClientError);
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=database_update_failed', req.url));
    }

    // 4. Store/upsert the tokens in crm_tokens table
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { data: existingToken, error: tokenSelectError } = await supabaseAdmin
      .from('crm_tokens')
      .select('id, refresh_token')
      .eq('client_id', clientId)
      .eq('crm_type', 'close')
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
          console.error('[Close OAuth Callback Warning] Failed to update crm_tokens row:', updateTokenError);
        }
      } else {
        // Insert new record
        const { error: insertTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .insert({
            client_id: clientId,
            crm_type: 'close',
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken || '',
            expires_at: expiresAt,
          });

        if (insertTokenError) {
          console.error('[Close OAuth Callback Warning] Failed to insert crm_tokens row:', insertTokenError);
        }
      }
    } else {
      console.error('[Close OAuth Callback Warning] Error checking existing token row in crm_tokens:', tokenSelectError);
    }

    // 5. Redirect to integrations page with connected flag
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?connected=close', req.url));
  } catch (err) {
    console.error('[Close OAuth Callback Exception] Unhandled callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=internal_server_error', req.url));
  }
}
