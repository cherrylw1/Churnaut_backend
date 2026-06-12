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

  // 2. Fall back to cookie-based validation
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    const token = session?.access_token;
    if (!token || typeof token !== 'string') return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// Deprecated wrapper for legacy references (will be removed once all routes migrate)
export async function getVerifiedClientId(req: NextRequest): Promise<string | null> {
  return getAuthedClientId(req);
}
