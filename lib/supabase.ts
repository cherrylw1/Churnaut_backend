import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Browser client using the public anonymous key (honors Row Level Security)
export const supabaseBrowser: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Server/Admin client using the service role key (bypasses Row Level Security)
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
