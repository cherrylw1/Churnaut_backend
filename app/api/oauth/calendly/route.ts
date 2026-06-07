import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session cookie
    const clientId = await getVerifiedClientId(req);
    if (!clientId) {
      console.log('[Calendly OAuth Redirect Info] Unauthenticated request, redirecting to login');
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // 2. Fetch the client's snippet_key to pass as state parameter
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('snippet_key')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !client || !client.snippet_key) {
      console.error('[Calendly OAuth Redirect Error] Client lookup failed:', error);
      return NextResponse.json({ error: 'Client profile not found or invalid session' }, { status: 404 });
    }

    const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
    if (!calendlyClientId) {
      console.error('[Calendly OAuth Redirect Error] CALENDLY_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Calendly integration is not configured on the server' }, { status: 500 });
    }

    // 3. Construct Calendly Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/calendly/callback';
    
    const calendlyAuthUrl = `https://auth.calendly.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(calendlyClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(client.snippet_key)}`;

    console.log('[Calendly OAuth Redirect Success] Redirecting client to Calendly');
    return NextResponse.redirect(calendlyAuthUrl);
  } catch (err) {
    console.error('[Calendly OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
