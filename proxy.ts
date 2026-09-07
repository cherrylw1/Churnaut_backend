// NOTE: proxy.ts is NOT a security boundary; all data access is enforced per-route via getAuthedClientId.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Do not reject dashboard navigations based on an expired/missing cookie.
  // Supabase may still have a refreshable session in browser storage, and the
  // dashboard layout synchronizes it before making authenticated API calls.
  // Every route handler remains responsible for authoritative token validation.
  const serverCookie = request.cookies.get('churnaut-session');
  if (serverCookie) {
    try {
      const session = JSON.parse(decodeURIComponent(serverCookie.value));
      if (typeof session?.access_token === 'string') {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('Authorization', `Bearer ${session.access_token}`);
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    } catch {
      // Route-level auth will return 401 for malformed cookies.
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
