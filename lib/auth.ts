import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Authoritative server-side auth. Verifies the Supabase access token's
 * signature + expiry via supabaseAdmin.auth.getUser(). Returns the verified
 * client/user id, or null. NEVER trust the cookie JSON directly.
 */
export async function getAuthedClientId(req: NextRequest): Promise<string | null> {
  // 1. Check Authorization header first
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      // Founder bypass — checked against dedicated secret, not user ID
      const founderSecret = process.env.FOUNDER_API_SECRET;
      if (founderSecret && token === founderSecret) {
        return 'founder';
      }
      // Otherwise, attempt standard Supabase JWT validation
      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && user) {
          return user.id;
        }
      } catch {}
    }
  }

  // 2. Prefer the HttpOnly server session cookie. The legacy Supabase cookie
  // remains as a migration fallback for already-signed-in browsers.
  for (const cookieName of ['churnaut-session', 'sb-auth-token']) {
    const cookie = req.cookies.get(cookieName);
    if (!cookie) continue;
    try {
      const session = JSON.parse(decodeURIComponent(cookie.value));
      const token = session?.access_token;
      if (!token || typeof token !== 'string') continue;
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) return user.id;
    } catch {
      // Try the legacy cookie if the new cookie is malformed or stale.
    }
  }
  return null;
}

// Deprecated wrapper for legacy references (will be removed once all routes migrate)
export async function getVerifiedClientId(req: NextRequest): Promise<string | null> {
  return getAuthedClientId(req);
}
