import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // State contains Churnaut client's snippet_key

  if (!code || !state) {
    console.error('[Pipedrive OAuth Callback Error] Missing code or state parameters');
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_parameters', req.url));
  }

  try {
    const pipedriveClientId = process.env.PIPEDRIVE_CLIENT_ID;
    const pipedriveClientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;

    if (!pipedriveClientId || !pipedriveClientSecret) {
      console.error('[Pipedrive OAuth Callback Error] Pipedrive credentials are not configured in environment');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=server_configuration_error', req.url));
    }

    // 1. Exchange OAuth code for access and refresh tokens
    const tokenUrl = 'https://oauth.pipedrive.com/oauth/token';
    const redirectUri = 'https://app.churnaut.com/api/oauth/pipedrive/callback';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${pipedriveClientId}:${pipedriveClientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('[Pipedrive OAuth Callback Error] Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL(`/dashboard/integrations/crm?error=token_exchange_failed&details=${encodeURIComponent(JSON.stringify(errorData))}`, req.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('[Pipedrive OAuth Callback Error] Token exchange response missing tokens');
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=missing_tokens', req.url));
    }

    // 2. Lookup Churnaut client by snippet_key (matching state)
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('snippet_key', state)
      .maybeSingle();

    if (clientError || !client) {
      console.error('[Pipedrive OAuth Callback Error] Client lookup failed for state:', state, clientError);
      return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=client_not_found', req.url));
    }

    // 3. Encrypt the tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    // 4. Update the clients table row
    const crmApiKeyJson = JSON.stringify({
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
    });

    const { error: updateClientError } = await supabaseAdmin
      .from('clients')
      .update({
        crm_type: 'pipedrive',
        crm_api_key: crmApiKeyJson,
      })
      .eq('id', client.id);

    if (updateClientError) {
      console.error('[Pipedrive OAuth Callback Error] Failed to update client record:', updateClientError);
      return NextResponse.json({ error: 'Failed to update client profile connection type' }, { status: 500 });
    }

    // 5. Store/upsert the tokens in crm_tokens table
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    const { data: existingToken, error: tokenSelectError } = await supabaseAdmin
      .from('crm_tokens')
      .select('id')
      .eq('client_id', client.id)
      .eq('crm_type', 'pipedrive')
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
          console.error('[Pipedrive OAuth Callback Warning] Failed to update crm_tokens row:', updateTokenError);
        }
      } else {
        // Insert new record
        const { error: insertTokenError } = await supabaseAdmin
          .from('crm_tokens')
          .insert({
            client_id: client.id,
            crm_type: 'pipedrive',
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            expires_at: expiresAt,
          });

        if (insertTokenError) {
          console.error('[Pipedrive OAuth Callback Warning] Failed to insert crm_tokens row:', insertTokenError);
        }
      }
    } else {
      console.error('[Pipedrive OAuth Callback Warning] Error checking existing token row in crm_tokens:', tokenSelectError);
    }

    // 6. Redirect to integrations page with connected flag
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?connected=pipedrive', req.url));
  } catch (err) {
    console.error('[Pipedrive OAuth Callback Exception] Unhandled callback error:', err);
    return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=internal_server_error', req.url));
  }
}
