import { supabaseAdmin } from '@/lib/supabase'
import { generateText } from '@/lib/llm/complete'
import { sendWeeklyDigest } from '@/lib/email/resend'
import { parseDigestAggregate, selectBestRep, selectTopSignal } from '@/lib/analytics/digest'
import { weeklyDigestOutputSchema } from '@/lib/validation'

export type ScheduledDigestClient = { id: string; email: string; company_name?: string | null; plan?: string | null }
export type ScheduledDigestRun = { periodStart: string; periodEnd: string; previousStart: string; weekStart: string }

export async function processScheduledDigest(client: ScheduledDigestClient, run: ScheduledDigestRun, idempotencyKey: string) {
  const { data: existing, error: existingError } = await supabaseAdmin.from('weekly_digests').select('id, delivery_status, sent_at, claimed_at, attempts, summary, top_signal, rep_spotlight, recommendation').eq('client_id', client.id).eq('week_start', run.weekStart).maybeSingle()
  if (existingError) throw existingError
  if (existing?.delivery_status === 'sent' && existing.sent_at) return { status: 'already_sent' as const }
  let digestJson: { summary: string; top_signal: string; rep_spotlight: string; recommendation: string } = { summary: '', top_signal: '', rep_spotlight: '', recommendation: '' }
  if (existing?.summary && existing.top_signal && existing.rep_spotlight && existing.recommendation) {
    digestJson = { summary: existing.summary, top_signal: existing.top_signal, rep_spotlight: existing.rep_spotlight, recommendation: existing.recommendation }
  } else {
    const [aggregateRes, snapRes] = await Promise.all([
      supabaseAdmin.rpc('digest_v2_aggregate', { client_id_input: client.id, current_start_input: run.periodStart, previous_start_input: run.previousStart, period_end_input: run.periodEnd }),
      supabaseAdmin.from('pipeline_snapshots').select('pressure_score, red_count, amber_count, green_count, total_deals').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const aggregate = parseDigestAggregate(aggregateRes.data)
    if (aggregateRes.error || !aggregate) throw new Error('Unable to calculate weekly digest metrics')
    if (snapRes.error) throw snapRes.error
    const current = aggregate.current
    const topSignal = selectTopSignal(current.signals)
    const bestRep = selectBestRep(current.reps)
    const snap = snapRes.data
    const pipelineLine = snap && snap.total_deals > 0 ? `Pipeline: ${snap.total_deals} open deals, pressure score ${snap.pressure_score}/100. ${snap.red_count} RED, ${snap.amber_count} AMBER, ${snap.green_count} GREEN.` : 'No Scout pipeline data for this period.'
    const prompt = `You are generating a weekly performance digest for a B2B SaaS customer using Churnaut. Weekly data: links ${current.links_created}, clicks ${current.clicks}, conversions ${current.conversions}, rule fires ${current.triggers}. Top signal: ${topSignal ? `${topSignal.signal} (${topSignal.converted}/${topSignal.total})` : 'none'}. Best rep: ${bestRep ? `${bestRep.rep} with ${bestRep.conversions}` : 'none'}. ${pipelineLine} Return ONLY JSON keys summary, top_signal, rep_spotlight, recommendation.`
    let raw = ''
    try { raw = await generateText(prompt, { temperature: 0.4, maxTokens: 600, context: { feature: 'weekly_digest_scheduled', scope: 'customer', clientId: client.id } }) } catch (error) { console.error('[Scheduled Digest] AI unavailable; using deterministic summary:', error instanceof Error ? error.message : 'unknown') }
    if (raw) {
      try { digestJson = weeklyDigestOutputSchema.parse(JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g, '').trim())) } catch { raw = '' }
    }
    if (!raw) digestJson = { summary: `This week recorded ${current.triggers} rule triggers, ${current.clicks} clicks, and ${current.conversions} conversions.`, top_signal: topSignal ? `Top signal: ${topSignal.signal}.` : 'No top signal was identified.', rep_spotlight: bestRep ? `Top rep: ${bestRep.rep} with ${bestRep.conversions} conversions.` : 'No rep conversion data was available.', recommendation: 'Review your highest-volume signal and keep its best-performing rule active.' }
  }
  let digestId: string
  const claimTimestamp = new Date().toISOString()
  if (existing?.id) {
    let claimQuery = supabaseAdmin.from('weekly_digests').update({ summary: digestJson.summary, top_signal: digestJson.top_signal, rep_spotlight: digestJson.rep_spotlight, recommendation: digestJson.recommendation, delivery_status: 'processing', claimed_at: claimTimestamp, attempts: (existing.attempts || 0) + 1, last_error: null }).eq('id', existing.id)
    if (existing.delivery_status === 'sent') claimQuery = claimQuery.eq('delivery_status', 'sent').is('sent_at', null)
    else if (existing.delivery_status) claimQuery = claimQuery.eq('delivery_status', existing.delivery_status)
    else claimQuery = claimQuery.is('delivery_status', null)
    claimQuery = existing.claimed_at ? claimQuery.eq('claimed_at', existing.claimed_at) : claimQuery.is('claimed_at', null)
    const { data: claimed, error: claimError } = await claimQuery.select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return { status: 'already_claimed' as const }
    digestId = claimed.id
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin.from('weekly_digests').insert({ client_id: client.id, week_start: run.weekStart, summary: digestJson.summary, top_signal: digestJson.top_signal, rep_spotlight: digestJson.rep_spotlight, recommendation: digestJson.recommendation, delivery_status: 'processing', claimed_at: claimTimestamp, attempts: 1, last_error: null }).select('id').maybeSingle()
    if (insertError?.code === '23505') return { status: 'already_claimed' as const }
    if (insertError || !inserted) throw insertError || new Error('Unable to persist weekly digest')
    digestId = inserted.id
  }
  const emailResult = await sendWeeklyDigest(client.email, digestJson, idempotencyKey)
  if (!emailResult.success) { await supabaseAdmin.from('weekly_digests').update({ delivery_status: 'failed', last_error: 'Email provider rejected the weekly digest' }).eq('id', digestId).eq('delivery_status', 'processing').eq('claimed_at', claimTimestamp); throw new Error('Weekly digest email delivery failed') }
  const { data: completed, error: completionError } = await supabaseAdmin.from('weekly_digests').update({ delivery_status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', digestId).eq('delivery_status', 'processing').eq('claimed_at', claimTimestamp).select('id').maybeSingle()
  if (completionError) throw completionError
  if (!completed) throw new Error('Weekly digest claim was lost before completion')
  return { status: 'sent' as const }
}
