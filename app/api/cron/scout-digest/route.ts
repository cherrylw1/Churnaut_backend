import { NextRequest, NextResponse } from 'next/server'
import { getPreviousUtcWeekRange } from '@/lib/time'
import { startWeeklyDigestRun } from '@/lib/background/queue'

// Per-client metrics continue to use the event-timed digest_v2_aggregate RPC;
// the worker executes it after this route enqueues the run.
// rpc('digest_v2_aggregate'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { periodStart, periodEnd, weekStart: weekStartStr } = getPreviousUtcWeekRange()
  const previousStart = new Date(new Date(periodStart).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  try {
    const run = await startWeeklyDigestRun({ weekStart: weekStartStr, periodStart, periodEnd, previousStart })
    return NextResponse.json({ success: true, run_id: run.runId, created: run.created, status: 'queued' })
  } catch (error) {
    console.error('[scout-digest cron] Failed to enqueue weekly digest run:', error)
    return NextResponse.json({ error: 'Failed to enqueue weekly digest run' }, { status: 500 })
  }
}
