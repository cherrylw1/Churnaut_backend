import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { touchHeartbeat, touchHeartbeatAttempt } from '@/lib/monitoring/heartbeat'
import { stagingCronsEnabled } from '@/lib/environment'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!stagingCronsEnabled()) return NextResponse.json({ success: true, disabled: true })
  await touchHeartbeatAttempt('log-retention')
  const { data, error } = await supabaseAdmin.rpc('purge_sensitive_logs', { interaction_days: 30, telemetry_days: 180 })
  if (error) { await touchHeartbeat('log-retention', 'failed', { failure_category: 'purge_error' }); return NextResponse.json({ error: 'Retention purge failed' }, { status: 503 }) }
  await supabaseAdmin.rpc('purge_ops_monitoring', { events_days: 30, resolved_alert_days: 90 })
  await touchHeartbeat('log-retention', 'ok')
  return NextResponse.json({ success: true, purged: Array.isArray(data) ? data[0] : data })
}
