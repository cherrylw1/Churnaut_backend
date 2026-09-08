import { supabaseAdmin } from '@/lib/supabase'
import { redactSensitive } from '@/lib/observability/redact'
import { getAppEnvironment } from '@/lib/environment'

export type OpsEventCode = 'auth_failure'|'auth_session_failed'|'oauth_failure'|'oauth_success'|'crm_unhealthy'|'crm_reconnected'|'webhook_rejected'|'webhook_failed'|'webhook_processed'|'billing_payment_failed'|'billing_recovered'|'cron_failed'|'cron_succeeded'|'email_delivery_failed'|'email_delivery_succeeded'|'ai_provider_failure'
export type OpsSeverity = 'info'|'warning'|'error'|'critical'
const ALLOWED = new Set(['status','provider','crm_type','job_type','attempt','auth_method','feature','operation','failure_category','count','email_kind','paused','logical_requests','failed_requests'])
export async function recordOpsEvent(input: { component: string; eventCode: OpsEventCode; severity?: OpsSeverity; clientId?: string; metadata?: Record<string, unknown> }): Promise<void> {
  const metadata = Object.fromEntries(Object.entries(input.metadata ?? {}).filter(([key]) => ALLOWED.has(key)).map(([key, value]) => [key, redactSensitive(value)]))
  try { await supabaseAdmin.from('ops_events').insert({ component: input.component, event_code: input.eventCode, severity: input.severity ?? 'error', client_id: input.clientId ?? null, environment: getAppEnvironment(), metadata }) } catch { /* monitoring is best effort */ }
}
