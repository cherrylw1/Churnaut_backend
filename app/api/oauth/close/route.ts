import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session cookie
    const clientId = getClientId(req);
    if (!clientId) {
      // Redirect unauthenticated requests to login page
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // 2. Fetch the client's snippet_key to pass as state parameter
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('snippet_key')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !client || !client.snippet_key) {
      console.error('[Close OAuth Redirect Error] Client lookup failed:', error);
      return NextResponse.json({ error: 'Client profile not found or invalid session' }, { status: 404 });
    }

    const closeClientId = process.env.CLOSE_CLIENT_ID;
    if (!closeClientId) {
      console.error('[Close OAuth Redirect Error] CLOSE_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Close integration is not configured on the server' }, { status: 500 });
    }

    // 3. Construct Close Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/close/callback';
    const scope = 'leads.read contacts.read opportunities.read users.read';
    
    const closeAuthUrl = `https://app.close.com/oauth2/authorize` +
      `?client_id=${encodeURIComponent(closeClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(client.snippet_key)}`;

    // 4. Redirect to Close
    return NextResponse.redirect(closeAuthUrl);
  } catch (err) {
    console.error('[Close OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
