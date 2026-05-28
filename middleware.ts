import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect all /dashboard routes
  if (path.startsWith('/dashboard')) {
    const authCookie = request.cookies.get('sb-auth-token');

    if (!authCookie) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const session = JSON.parse(decodeURIComponent(authCookie.value));
      const expiresAt = session?.expires_at;

      // Redirect to login if session has expired
      if (!expiresAt || expiresAt * 1000 < Date.now()) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    } catch (error) {
      console.error('[Middleware Auth Error] Failed to parse auth cookie:', error);
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
