import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateText } from '@/lib/llm/complete'
import { sendWeeklyDigest } from '@/lib/email/resend'
import { getPreviousUtcWeekRange } from '@/lib/time'
import {
  parseDigestAggregate,
  selectBestRep,
  selectTopSignal,
} from '@/lib/analytics/digest'
import { weeklyDigestOutputSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all active Growth+ clients with email
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, email, company_name, plan')
    .eq('active', true)
    .in('plan', ['growth', 'pro'])

  if (error || !clients) {
    console.error('[scout-digest cron] Failed to fetch clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }

  // Use a stable Monday-to-Monday UTC reporting window. Manual retries later in
  // the week must target the same digest row instead of creating a new key.
  const { periodStart, periodEnd, weekStart: weekStartStr } = getPreviousUtcWeekRange()
  const previousStart = new Date(new Date(periodStart).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const client of clients) {
    if (!client.email) { skipped++; continue }

    try {
      // Skip completed or actively processing deliveries. Failed and stale
      // claims remain eligible for a retry.
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('weekly_digests')
        .select('id, delivery_status, claimed_at, attempts')
        .eq('client_id', client.id)
        .eq('week_start', weekStartStr)
        .maybeSingle()
      if (existingError) throw existingError
      const staleBefore = Date.now() - 15 * 60 * 1000
      const activelyProcessing = existing?.delivery_status === 'processing' &&
        !!existing.claimed_at && new Date(existing.claimed_at).getTime() >= staleBefore
      if (existing?.delivery_status === 'sent' || activelyProcessing) { skipped++; continue }

      // Fetch exact, event-timed metrics. The database aggregate avoids the
      // PostgREST row cap and never treats lifetime counters as weekly data.
      const [aggregateRes, snapRes] = await Promise.all([
        supabaseAdmin.rpc('digest_v2_aggregate', {
          client_id_input: client.id,
          current_start_input: periodStart,
          previous_start_input: previousStart,
          period_end_input: periodEnd,
        }),
        supabaseAdmin
          .from('pipeline_snapshots')
          .select('pressure_score, red_count, amber_count, green_count, total_deals')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const aggregate = parseDigestAggregate(aggregateRes.data)
      if (aggregateRes.error || !aggregate) {
        console.error(`[scout-digest cron] Aggregate failed for client ${client.id}:`, aggregateRes.error)
        throw new Error('Unable to calculate weekly digest metrics')
      }
      const snap = snapRes.data
      if (snapRes.error) throw snapRes.error

      const totalLinks = aggregate.current.links_created
      const totalClicks = aggregate.current.clicks
      const totalConversions = aggregate.current.conversions
      const triggerCount = aggregate.current.triggers
      const topSignal = selectTopSignal(aggregate.current.signals)
      const bestRep = selectBestRep(aggregate.current.reps)

      const pipelineLine = snap && snap.total_deals > 0
        ? `Pipeline: ${snap.total_deals} open deals, pressure score ${snap.pressure_score}/100. ${snap.red_count} RED, ${snap.amber_count} AMBER, ${snap.green_count} GREEN.`
        : 'No Scout pipeline data for this period.'

      const prompt = `You are generating a weekly performance digest for a B2B SaaS customer using Churnaut.

Weekly data:
- Tracked links created: ${totalLinks}
- Prospect clicks: ${totalClicks}
- Conversions: ${totalConversions}
- Personalization rule fires: ${triggerCount}
- Top signal: ${topSignal ? `${topSignal.signal} (${topSignal.converted}/${topSignal.total} conversions)` : 'none'}
- Best rep: ${bestRep ? `${bestRep.rep} with ${bestRep.conversions} conversions` : 'none this week'}
- ${pipelineLine}

Return ONLY a JSON object (no markdown) with exactly these keys:
{
  "summary": "2-3 sentence pipeline narrative. Be specific and direct.",
  "top_signal": "1 sentence on best performing signal and why it matters.",
  "rep_spotlight": "1 sentence on rep performance or 'No rep conversion data this week.'",
  "recommendation": "1 concrete action the team should take this week based on the data."
}`

      const raw = await generateText(prompt, { temperature: 0.4, maxTokens: 600 })

      let digestJson: { summary: string; top_signal: string; rep_spotlight: string; recommendation: string }
      try {
        const cleaned = raw.replace(/```json|```/g, '').trim()
        digestJson = weeklyDigestOutputSchema.parse(JSON.parse(cleaned))
      } catch {
        console.error(`[scout-digest cron] JSON parse failed for client ${client.id}`)
        errors.push(client.id)
        continue
      }

      // Atomically claim this client's weekly delivery. The unique client/week
      // index prevents concurrent cron invocations from sending duplicates.
      const claimedAt = new Date().toISOString()
      let savedDigest: { id: string } | null = null
      if (existing) {
        let claimQuery = supabaseAdmin.from('weekly_digests').update({
          summary: digestJson.summary,
          top_signal: digestJson.top_signal,
          rep_spotlight: digestJson.rep_spotlight,
          recommendation: digestJson.recommendation,
          delivery_status: 'processing',
          claimed_at: claimedAt,
          sent_at: null,
          attempts: (existing.attempts || 1) + 1,
          last_error: null,
        }).eq('id', existing.id).eq('delivery_status', existing.delivery_status)
        claimQuery = existing.claimed_at
          ? claimQuery.eq('claimed_at', existing.claimed_at)
          : claimQuery.is('claimed_at', null)
        const { data: reclaimed, error: reclaimError } = await claimQuery.select('id').maybeSingle()
        if (reclaimError) throw reclaimError
        savedDigest = reclaimed
      } else {
        const { data: inserted, error: digestInsertError } = await supabaseAdmin.from('weekly_digests').insert({
          client_id: client.id,
          week_start: weekStartStr,
          summary: digestJson.summary,
          top_signal: digestJson.top_signal,
          rep_spotlight: digestJson.rep_spotlight,
          recommendation: digestJson.recommendation,
          delivery_status: 'processing',
          claimed_at: claimedAt,
          sent_at: null,
          attempts: 1,
          last_error: null,
        }).select('id').single()
        if (digestInsertError) {
          if (digestInsertError.code === '23505') { skipped++; continue }
          throw digestInsertError
        }
        savedDigest = inserted
      }
      if (!savedDigest) { skipped++; continue }

      const emailResult = await sendWeeklyDigest(client.email, digestJson)
      if (!emailResult.success) {
        const { error: failureError } = await supabaseAdmin.from('weekly_digests').update({
          delivery_status: 'failed',
          last_error: 'Email provider rejected the weekly digest',
        }).eq('id', savedDigest.id).eq('delivery_status', 'processing')
        if (failureError) throw failureError
        throw new Error('Weekly digest email delivery failed')
      }

      const { data: completedDigest, error: completionError } = await supabaseAdmin.from('weekly_digests').update({
        delivery_status: 'sent',
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', savedDigest.id).eq('delivery_status', 'processing').select('id').maybeSingle()
      if (completionError) throw completionError
      if (!completedDigest) throw new Error('Weekly digest claim was lost before completion')
      sent++

    } catch (e) {
      console.error(`[scout-digest cron] Error for client ${client.id}:`, e)
      errors.push(client.id)
    }
  }

  return NextResponse.json({ success: true, sent, skipped, errors, total: clients.length })
}
