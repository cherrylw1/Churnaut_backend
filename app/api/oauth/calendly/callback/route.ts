import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // State contains Churnaut client's snippet_key

  if (!code || !state) {
    console.error('[Calendly OAuth Callback Error] Missing code or state parameters');
    return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_parameters', req.url));
  }

  try {
    const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
    const calendlyClientSecret = process.env.CALENDLY_CLIENT_SECRET;

    if (!calendlyClientId || !calendlyClientSecret) {
      console.error('[Calendly OAuth Callback Error] Calendly credentials are not configured in environment');
      return NextResponse.redirect(new URL('/dashboard/integrations?error=server_configuration_error', req.url));
    }

    // 1. Exchange OAuth code for access and refresh tokens
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
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[Calendly OAuth Callback Error] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL(`/dashboard/integrations?error=token_exchange_failed&details=${encodeURIComponent(JSON.stringify(errorData))}`, req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('[Calendly OAuth Callback Error] Token exchange response missing tokens');
      return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_tokens', req.url));
    }

    // 2. Lookup Churnaut client by snippet_key (matching state)
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('snippet_key', state)
      .maybeSingle();

    if (clientError || !client) {
      console.error('[Calendly OAuth Callback Error] Client lookup failed for state:', state, clientError);
      return NextResponse.redirect(new URL('/dashboard/integrations?error=client_not_found', req.url));
    }

    // 3. Encrypt the tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    // 4. Update the clients table row setting the calendly_token field
    const { error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update({
        calendly_token: encryptedAccessToken,
      })
      .eq('id', client.id);

    if (updateClientError) {
      console.error('[Calendly OAuth Callback Error] Failed to update client record:', updateClientError);
      return NextResponse.redirect(new URL('/dashboard/integrations?error=database_update_failed', req.url));
    }

    // 5. Store/upsert the tokens in crm_tokens table with crm_type: 'calendly'
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { data: existingToken, error: tokenSelectError } = await supabaseAdmin
      .from('crm_tokens')
      .select('id')
      .eq('client_id', client.id)
      .eq('crm_type', 'calendly')
      .maybeSingle();

    if (!tokenSelectError) {
      if (existingToken) {
        // Update existing record
        const { error: updateTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .update({
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingToken.id);
        
        if (updateTokenError) {
          console.error('[Calendly OAuth Callback Warning] Failed to update crm_tokens row:', updateTokenError);
        }
      } else {
        // Insert new record
        const { error: insertTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .insert({
            client_id: client.id,
            crm_type: 'calendly',
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            expires_at: expiresAt,
          });

        if (insertTokenError) {
          console.error('[Calendly OAuth Callback Warning] Failed to insert crm_tokens row:', insertTokenError);
        }
      }
    } else {
      console.error('[Calendly OAuth Callback Warning] Error checking existing token row in crm_tokens:', tokenSelectError);
    }

    console.log('[Calendly OAuth Callback Success] Successfully authenticated and stored tokens');
    // 6. Redirect to settings page with connected flag
    return NextResponse.redirect(new URL('/dashboard/integrations/calendly?connected=true', req.url));
  } catch (err) {
    console.error('[Calendly OAuth Callback Exception] Unhandled callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations?error=internal_server_error', req.url));
  }
}
