import { supabaseAdmin } from '@/lib/supabase';

/** Providers with a complete Scout ingestion/enrichment adapter. */
export const SUPPORTED_SCOUT_CRM = ['hubspot'] as const;
export type SupportedScoutCrm = (typeof SUPPORTED_SCOUT_CRM)[number];
export function hasScoutAdapter(value: string | null | undefined): value is SupportedScoutCrm {
  return !!value && (SUPPORTED_SCOUT_CRM as readonly string[]).includes(value);
}

export async function getScoutConnectionStatus(clientId: string): Promise<
  { ready: true; crmType: SupportedScoutCrm } |
  { ready: false; reason: 'missing_client' | 'missing_crm' | 'unsupported_provider' | 'missing_token' | 'unhealthy_connection' | 'lookup_failed' }
> {
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('crm_type')
    .eq('id', clientId)
    .maybeSingle();
  if (clientError) return { ready: false, reason: 'lookup_failed' };
  if (!client) return { ready: false, reason: 'missing_client' };
  if (!client.crm_type) return { ready: false, reason: 'missing_crm' };
  if (!hasScoutAdapter(client.crm_type)) return { ready: false, reason: 'unsupported_provider' };

  const { data: token, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token, connection_status')
    .eq('client_id', clientId)
    .eq('crm_type', client.crm_type)
    .maybeSingle();
  if (tokenError) return { ready: false, reason: 'lookup_failed' };
  if (!token?.access_token) return { ready: false, reason: 'missing_token' };
  if (token.connection_status === 'unhealthy') return { ready: false, reason: 'unhealthy_connection' };
  return { ready: true, crmType: client.crm_type };
}
