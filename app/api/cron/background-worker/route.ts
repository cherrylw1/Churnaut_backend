import { NextRequest, NextResponse } from 'next/server'
import { runBackgroundWorker } from '@/lib/background/worker'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.BACKGROUND_JOBS_PAUSED === 'true') return NextResponse.json({ success: true, paused: true })
  try {
    const counts = await runBackgroundWorker()
    return NextResponse.json({ success: true, ...counts })
  } catch (error) {
    console.error('[background-worker] fatal error:', error)
    return NextResponse.json({ error: 'Background worker failed' }, { status: 500 })
  }
}
