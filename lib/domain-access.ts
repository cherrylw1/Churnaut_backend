import { supabaseAdmin } from '@/lib/supabase';
import { normalizeTrackedOrigin } from '@/lib/url';

export async function isRegisteredClientOrigin(clientId: string, originHeader: string | null): Promise<boolean> {
  if (!originHeader) return process.env.NODE_ENV !== 'production';
  let origin: string;
  try { origin = normalizeTrackedOrigin(originHeader); } catch { return false; }
  const vercelEnvironment = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnvironment && vercelEnvironment !== 'production' && new URL(origin).hostname.endsWith('.vercel.app')) return true;
  const { data, error: domainError } = await supabaseAdmin.from('client_domains').select('id').eq('client_id', clientId).eq('origin', origin).eq('active', true).maybeSingle();
  if (domainError) throw new Error(`Unable to verify registered domains: ${domainError.message}`);
  if (data) return true;
  // Compatibility while the additive domain migration rolls out.
  const { data: client, error: clientError } = await supabaseAdmin.from('clients').select('domain').eq('id', clientId).maybeSingle();
  if (clientError) throw new Error(`Unable to verify the legacy client domain: ${clientError.message}`);
  try { return !!client?.domain && normalizeTrackedOrigin(client.domain) === origin; } catch { return false; }
}
