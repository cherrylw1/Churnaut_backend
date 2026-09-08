import { logError, logInfo } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { touchHeartbeat, touchHeartbeatAttempt } from '@/lib/monitoring/heartbeat'
import { stagingCronsEnabled } from '@/lib/environment'

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    logError('[Cron Error] CRON_SECRET is not configured on the server')
    return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!stagingCronsEnabled()) return NextResponse.json({ success: true, disabled: true })

  try {
    await touchHeartbeatAttempt('reset-visits')
    const { error } = await supabaseAdmin
      .from('clients')
      .update({
        monthly_visits: 0,
        visits_reset_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      logError('[Cron Error] Failed to reset monthly visits:', error)
      await touchHeartbeat('reset-visits', 'failed', { failure_category: 'reset_error' })
      return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
    }

    logInfo('[Cron] Monthly visits reset successfully at', new Date().toISOString())
    await touchHeartbeat('reset-visits', 'ok', { count: 1 })
    return NextResponse.json({ success: true, reset_at: new Date().toISOString() })
  } catch (err) {
    await touchHeartbeat('reset-visits', 'failed', { failure_category: 'reset_error' })
    logError('[Cron Error] Unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
