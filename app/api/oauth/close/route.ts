import { NextRequest, NextResponse } from 'next/server';

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

    const closeClientId = process.env.CLOSE_CLIENT_ID;
    if (!closeClientId) {
      console.error('[Close OAuth Redirect Error] CLOSE_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Close integration is not configured on the server' }, { status: 500 });
    }

    // 2. Construct Close Authorization URL
    const closeAuthUrl = `https://app.close.com/oauth2/authorize/` +
      `?client_id=${encodeURIComponent(closeClientId)}` +
      `&response_type=code`;

    // 3. Redirect to Close
    return NextResponse.redirect(closeAuthUrl);
  } catch (err) {
    console.error('[Close OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
