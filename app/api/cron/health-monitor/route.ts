import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { evaluateMonitoring } from '@/lib/monitoring/evaluate'
import { notifyOpsAlert } from '@/lib/monitoring/notifier'
import { recordOpsEvent } from '@/lib/monitoring/events'
import { logError } from '@/lib/observability/logger'
import { stagingCronsEnabled } from '@/lib/environment'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!stagingCronsEnabled()) return NextResponse.json({ ok: true, disabled: true })
  try {
    const result = await evaluateMonitoring()
    const activeKeys = new Set(result.alerts.filter((alert) => alert.active).map((alert) => alert.key))
    for (const alert of result.alerts) {
      const { error: reconcileError } = await supabaseAdmin.rpc('reconcile_ops_alert', { alert_key_input: alert.key, component_input: alert.component, severity_input: alert.severity, summary_input: alert.summary, active_input: alert.active, metadata_input: alert.metadata ?? {} })
      if (reconcileError) throw reconcileError
      if (alert.active) {
        const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_ops_alert_notification', { alert_key_input: alert.key, cooldown_minutes: 30 })
        if (claimError) throw claimError
        if (claimed) { const sent = await notifyOpsAlert(alert); const { error: completeError } = await supabaseAdmin.rpc('complete_ops_alert_notification', { alert_key_input: alert.key, sent_input: sent }); if (completeError) throw completeError }
      }
    }
    const { data: openAlerts, error: openError } = await supabaseAdmin.from('ops_alert_state').select('alert_key,component,severity,summary').eq('status', 'open').limit(1000)
    if (openError) throw openError
    for (const existing of openAlerts ?? []) {
      if (activeKeys.has(existing.alert_key)) continue
      const { error: resolveError } = await supabaseAdmin.rpc('reconcile_ops_alert', { alert_key_input: existing.alert_key, component_input: existing.component, severity_input: existing.severity, summary_input: existing.summary, active_input: false, metadata_input: {} })
      if (resolveError) throw resolveError
    }
    const { error: heartbeatError } = await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: 'health-monitor', status_input: 'ok', metadata_input: { count: result.alerts.filter((a) => a.active).length } })
    if (heartbeatError) throw heartbeatError
    await recordOpsEvent({ component: 'cron', eventCode: 'cron_succeeded', severity: 'info', metadata: { job_type: 'health-monitor' } })
    return NextResponse.json({ ok: true, active_alerts: result.alerts.filter((a) => a.active).length })
  } catch (error) {
    logError('[health-monitor] failed', error)
    try { await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: 'health-monitor', status_input: 'failed', metadata_input: { failure_category: 'monitor_error' } }) } catch { /* best effort */ }
    await recordOpsEvent({ component: 'cron', eventCode: 'cron_failed', severity: 'critical', metadata: { job_type: 'health-monitor', failure_category: 'monitor_error' } })
    return NextResponse.json({ error: 'Health monitor unavailable' }, { status: 503 })
  }
}
