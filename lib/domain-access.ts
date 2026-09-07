import { supabaseAdmin } from '@/lib/supabase';
import { normalizeTrackedOrigin } from '@/lib/url';

export async function isRegisteredClientOrigin(clientId: string, originHeader: string | null): Promise<boolean> {
  if (!originHeader) return process.env.NODE_ENV !== 'production';
  let origin: string;
  try { origin = normalizeTrackedOrigin(originHeader); } catch { return false; }
  const vercelEnvironment = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnvironment && vercelEnvironment !== 'production' && new URL(origin).hostname.endsWith('.vercel.app')) return true;
  const { data } = await supabaseAdmin.from('client_domains').select('id').eq('client_id', clientId).eq('origin', origin).eq('active', true).maybeSingle();
  if (data) return true;
  // Compatibility while the additive domain migration rolls out.
  const { data: client } = await supabaseAdmin.from('clients').select('domain').eq('id', clientId).maybeSingle();
  try { return !!client?.domain && normalizeTrackedOrigin(client.domain) === origin; } catch { return false; }
}
