import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { sendVisitLimitWarningEmail } from '@/lib/email/resend'
import { PLAN_LIMITS } from '@/lib/plans'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, email, company_name, plan, monthly_visits, active')
    .eq('active', true)
    .neq('plan', 'pro')

  if (error || !clients) {
    console.error('[check-visit-limits] Failed to fetch clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }

  const now = new Date()
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`
  const upgradeUrl = 'https://app.churnaut.com/dashboard/billing'

  let warned80 = 0
  let warnedLimit = 0

  for (const client of clients) {
    if (!client.email) continue
    const limit = PLAN_LIMITS[client.plan as keyof typeof PLAN_LIMITS]?.tracked_visits ?? 500
    if (limit === Infinity) continue
    const pct = (client.monthly_visits / limit) * 100

    // 100% — limit hit warning (once per month)
    if (pct >= 100) {
      const key = `visit_warn_limit:${client.id}:${monthKey}`
      try {
        const already = await redis.get(key)
        if (!already) {
          await sendVisitLimitWarningEmail(client.email, client.company_name || 'there', 100, client.plan, upgradeUrl)
          await redis.setex(key, 60 * 60 * 24 * 35, '1') // 35 days TTL
          warnedLimit++
        }
      } catch (e) { console.error('[check-visit-limits] limit warn error:', e) }
    }
    // 80–99% — approaching warning (once per month)
    else if (pct >= 80) {
      const key = `visit_warn_80:${client.id}:${monthKey}`
      try {
        const already = await redis.get(key)
        if (!already) {
          await sendVisitLimitWarningEmail(client.email, client.company_name || 'there', pct, client.plan, upgradeUrl)
          await redis.setex(key, 60 * 60 * 24 * 35, '1')
          warned80++
        }
      } catch (e) { console.error('[check-visit-limits] 80% warn error:', e) }
    }
  }

  return NextResponse.json({ success: true, warned80, warnedLimit, checked: clients.length })
}
