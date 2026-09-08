import { supabaseAdmin } from '@/lib/supabase'
type Alert = { key: string; component: string; severity: string; summary: string; active: boolean; metadata?: Record<string, unknown> }

/** Deterministic, privacy-safe alert evaluation. Only counts and stable IDs leave this module. */
export async function evaluateMonitoring() {
  const now = Date.now(); const since = new Date(now - 10 * 60_000).toISOString()
  const [eventsResult, heartbeatResult, deadResult, backlogResult, oldestResult, crmResult, billingResult, attemptsResult, openResult] = await Promise.all([
    supabaseAdmin.from('ops_events').select('event_code,component,client_id,metadata').gte('created_at', since).limit(5000),
    supabaseAdmin.from('service_heartbeats').select('service_name,last_attempt_at,last_success_at,status,metadata'),
    supabaseAdmin.from('background_jobs').select('id', { count: 'exact', head: true }).eq('status', 'dead'),
    supabaseAdmin.from('background_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued','retry']),
    supabaseAdmin.from('background_jobs').select('available_at').in('status', ['queued','retry']).order('available_at', { ascending: true }).limit(1),
    supabaseAdmin.from('crm_tokens').select('client_id,crm_type').eq('connection_status', 'unhealthy').limit(1000),
    supabaseAdmin.from('clients').select('id').eq('plan_status', 'past_due').limit(1000),
    supabaseAdmin.from('llm_logs').select('request_id,provider,status').eq('record_type', 'provider_attempt').gte('created_at', since).limit(5000),
    supabaseAdmin.from('ops_alert_state').select('alert_key').eq('status', 'open').like('alert_key', 'ai:%:outage').limit(100),
  ])
  const queryErrors = [eventsResult, heartbeatResult, deadResult, backlogResult, oldestResult, crmResult, billingResult, attemptsResult, openResult].filter((result) => result.error)
  if (queryErrors.length) throw new Error('Monitoring state query failed')
  const events = eventsResult.data; const heartbeats = heartbeatResult.data; const deadJobs = deadResult.count; const backlog = backlogResult.count; const oldestQueued = oldestResult.data; const unhealthyCrm = crmResult.data; const pastDue = billingResult.data; const attempts = attemptsResult.data
  const openAiAlerts = new Set((openResult.data ?? []).map((row) => row.alert_key))
  const counts = new Map<string, number>(); for (const event of events ?? []) counts.set(event.event_code, (counts.get(event.event_code) ?? 0) + 1)
  const paused = process.env.BACKGROUND_JOBS_PAUSED === 'true'
  const freshnessMs: Record<string, number> = {
    'background-worker': 15 * 60_000,
    'health-monitor': 15 * 60_000,
    'reset-visits': 35 * 24 * 60 * 60_000,
    'scout-digest': 8 * 24 * 60 * 60_000,
    'check-visit-limits': 2 * 24 * 60 * 60_000,
    'log-retention': 2 * 24 * 60 * 60_000,
  }
  const alerts: Alert[] = [
    { key: 'auth:failure_spike', component: 'auth', severity: 'warning', summary: 'Elevated authentication failures', active: (counts.get('auth_failure') ?? 0) >= 10, metadata: { count: counts.get('auth_failure') ?? 0 } },
    { key: 'webhook:processing', component: 'webhook', severity: 'error', summary: 'Repeated webhook processing failures', active: (counts.get('webhook_failed') ?? 0) >= 3, metadata: { count: counts.get('webhook_failed') ?? 0 } },
    { key: 'email:delivery_failures', component: 'email', severity: 'error', summary: 'Email delivery failures detected', active: (counts.get('email_delivery_failed') ?? 0) >= 3, metadata: { count: counts.get('email_delivery_failed') ?? 0 } },
    { key: 'background:dead_jobs', component: 'background', severity: 'critical', summary: 'Dead background jobs detected', active: (deadJobs ?? 0) > 0, metadata: { count: deadJobs ?? 0 } },
    { key: 'background:queue_backlog', component: 'background', severity: 'warning', summary: 'Background queue backlog detected', active: !paused && !!oldestQueued?.[0]?.available_at && now - Date.parse(oldestQueued[0].available_at) > 15 * 60_000, metadata: { count: backlog ?? 0 } },
  ]
  const webhookFailures = new Map<string, number>()
  for (const event of events ?? []) if (event.event_code === 'webhook_failed' && event.client_id) webhookFailures.set(event.client_id, (webhookFailures.get(event.client_id) ?? 0) + 1)
  for (const [clientId, count] of webhookFailures) alerts.push({ key: `webhook:${clientId}:processing`, component: 'webhook', severity: 'error', summary: 'Repeated webhook processing failures for a client', active: count >= 3, metadata: { count } })
  const byProvider = new Map<string, Map<string, boolean>>()
  let attemptIndex = 0
  for (const attempt of attempts ?? []) {
    if (['budget_denied', 'provider_disabled', 'pricing_missing'].includes(attempt.status)) continue
    const provider = attempt.provider || 'unknown'; const requests = byProvider.get(provider) ?? new Map<string, boolean>();
    const id = attempt.request_id || `${provider}:unknown:${attemptIndex++}`
    requests.set(id, (requests.get(id) ?? false) || attempt.status === 'success'); byProvider.set(provider, requests)
  }
  for (const [provider, requests] of byProvider) {
    const total = requests.size; const failed = [...requests.values()].filter((success) => !success).length
    const critical = total >= 10 && failed / total >= 0.8; const warning = total >= 5 && failed / total >= 0.5
    const hasSuccess = [...requests.values()].some(Boolean)
    const recovery = hasSuccess && !warning
    const key = `ai:${provider}:outage`
    const active = warning || (openAiAlerts.has(key) && !recovery)
    alerts.push({ key, component: 'ai', severity: critical ? 'critical' : 'error', summary: `${provider} AI provider failures detected`, active, metadata: { provider, logical_requests: total, failed_requests: failed } })
  }
  // Do not resolve an outage merely because traffic stopped. Keep an existing
  // alert open until a later provider request demonstrates recovery.
  for (const key of openAiAlerts) if (!alerts.some((alert) => alert.key === key)) {
    const provider = key.split(':')[1] || 'unknown'
    alerts.push({ key, component: 'ai', severity: 'error', summary: `${provider} AI provider outage remains under observation`, active: true, metadata: { provider, logical_requests: 0, failed_requests: 0 } })
  }
  for (const row of unhealthyCrm ?? []) alerts.push({ key: `crm:${row.client_id}:${row.crm_type}`, component: 'crm', severity: 'error', summary: 'CRM connection is unhealthy', active: true, metadata: { crm_type: row.crm_type, status: 'unhealthy' } })
  for (const row of pastDue ?? []) alerts.push({ key: `billing:${row.id}:past_due`, component: 'billing', severity: 'warning', summary: 'Payment is past due', active: true, metadata: { status: 'past_due' } })
  for (const heartbeat of heartbeats ?? []) {
    const last = heartbeat.last_success_at ? Date.parse(heartbeat.last_success_at) : 0
    const pauseSuppressed = paused && heartbeat.service_name === 'background-worker'
    const stale = heartbeat.status !== 'paused' && !pauseSuppressed && (!last || now - last > (freshnessMs[heartbeat.service_name] ?? 15 * 60_000))
    alerts.push({ key: `service:${heartbeat.service_name}:stale`, component: 'service', severity: 'critical', summary: `${heartbeat.service_name} heartbeat is stale`, active: stale, metadata: { status: heartbeat.status, paused } })
  }
  const requiredServices = ['background-worker', 'health-monitor']
  const known = new Set((heartbeats ?? []).map((heartbeat) => heartbeat.service_name))
  for (const service of requiredServices) if (!known.has(service) && !(paused && service === 'background-worker')) alerts.push({ key: `service:${service}:stale`, component: 'service', severity: 'critical', summary: `${service} heartbeat is missing`, active: true, metadata: { status: 'missing', paused } })
  return { alerts, counts: Object.fromEntries(counts), heartbeats: heartbeats ?? [], dead_jobs: deadJobs ?? 0, queued_jobs: backlog ?? 0 }
}
