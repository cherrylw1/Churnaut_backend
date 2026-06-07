import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isProduction = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';

if (isProduction) {
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is missing in production!');
  }
  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is missing in production!');
  }
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is missing in production!');
  }
}

// Fallback placeholders for non-production environments to prevent createClient from throwing a fatal runtime crash if variables are missing
const safeUrl = supabaseUrl || 'https://placeholder-project.supabase.co';
const safeAnonKey = supabaseAnonKey || 'placeholder-anon-key-to-prevent-crash';
const safeServiceKey = supabaseServiceKey || 'placeholder-service-key-to-prevent-crash';

// Custom cookie-based storage for Supabase auth persistence
const cookieStorage = {
  getItem: (key: string): string | null => {
    if (typeof document === 'undefined') return null;
    const name = key + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    if (typeof document === 'undefined') return;
    const d = new Date();
    d.setTime(d.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days TTL
    document.cookie = `${key}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  },
  removeItem: (key: string): void => {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  }
};

// Browser client using the public anonymous key (honors Row Level Security)
export const supabaseBrowser: SupabaseClient = createClient(safeUrl, safeAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'sb-auth-token',
    storage: cookieStorage,
  }
});

// Server/Admin client using the service role key (bypasses Row Level Security)
export const supabaseAdmin: SupabaseClient = createClient(safeUrl, safeServiceKey);
