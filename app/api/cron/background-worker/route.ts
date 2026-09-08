import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server'
import { runBackgroundWorker } from '@/lib/background/worker'
import { recordOpsEvent } from '@/lib/monitoring/events'
import { supabaseAdmin } from '@/lib/supabase'
import { touchHeartbeatAttempt } from '@/lib/monitoring/heartbeat'
import { stagingCronsEnabled } from '@/lib/environment'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!stagingCronsEnabled()) return NextResponse.json({ success: true, paused: true, disabled: true })
  if (process.env.BACKGROUND_JOBS_PAUSED === 'true') { await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: 'background-worker', status_input: 'paused', metadata_input: { paused: true } }); return NextResponse.json({ success: true, paused: true }) }
  await touchHeartbeatAttempt('background-worker')
  try {
    const counts = await runBackgroundWorker()
    await recordOpsEvent({ component: 'cron', eventCode: 'cron_succeeded', severity: 'info', metadata: { job_type: 'background-worker', count: counts.succeeded } })
    await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: 'background-worker', status_input: 'ok', metadata_input: { count: counts.succeeded } })
    return NextResponse.json({ success: true, ...counts })
  } catch (error) {
    logError('[background-worker] fatal error:', error)
    await recordOpsEvent({ component: 'cron', eventCode: 'cron_failed', severity: 'critical', metadata: { job_type: 'background-worker', failure_category: 'worker_error' } })
    await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: 'background-worker', status_input: 'failed', metadata_input: { failure_category: 'worker_error' } })
    return NextResponse.json({ error: 'Background worker failed' }, { status: 500 })
  }
}
