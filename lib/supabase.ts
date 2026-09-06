import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isProduction = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
const isServer = typeof window === 'undefined';

if (isProduction) {
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is missing in production!');
  }
  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is missing in production!');
  }
  // Service-role key exists only on the server and must never be in the browser bundle.
  if (isServer && !supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is missing in production!');
  }
}

// Fallback placeholders for non-production environments to prevent createClient from throwing a fatal runtime crash if variables are missing
const safeUrl = supabaseUrl || 'https://placeholder-project.supabase.co';
const safeAnonKey = supabaseAnonKey || 'placeholder-anon-key-to-prevent-crash';
const safeServiceKey = supabaseServiceKey || 'placeholder-service-key-to-prevent-crash';

// Browser client uses Supabase's default localStorage adapter. Authentication
// for server routes is established separately in the HttpOnly `churnaut-session`
// cookie, so access tokens are no longer written to a script-readable cookie.
export const supabaseBrowser: SupabaseClient = createClient(safeUrl, safeAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'sb-auth-token',
  }
});

// Server/Admin client using the service role key (bypasses Row Level Security)
export const supabaseAdmin: SupabaseClient = createClient(safeUrl, safeServiceKey);
