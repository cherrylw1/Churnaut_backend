import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron Error] CRON_SECRET is not configured on the server')
    return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('clients')
      .update({
        monthly_visits: 0,
        visits_reset_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      console.error('[Cron Error] Failed to reset monthly visits:', error)
      return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
    }

    console.log('[Cron] Monthly visits reset successfully at', new Date().toISOString())
    return NextResponse.json({ success: true, reset_at: new Date().toISOString() })
  } catch (err) {
    console.error('[Cron Error] Unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
