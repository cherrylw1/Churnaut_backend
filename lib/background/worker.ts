import { logError, logWarn, logInfo } from '../observability/logger';
import { supabaseAdmin } from '@/lib/supabase'
import { claimBackgroundJobs, completeBackgroundJob, enqueueJob, failBackgroundJob, reconcileWeeklyDigestRun, type BackgroundJob } from '@/lib/background/queue'
import { processScheduledDigest } from '@/lib/digest/scheduled'
import { safeErrorMessage } from '@/lib/observability/redact'

const PAGE_SIZE = 250
export function parseWorkerConcurrency(value = process.env.BACKGROUND_WORKER_CONCURRENCY) {
  const parsed = Number(value ?? 2)
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 5) : 2
}
const MAX_CONCURRENCY = parseWorkerConcurrency()

function retryAt(attempt: number) {
  const delays = [60, 300, 900, 3600]
  return new Date(Date.now() + (delays[Math.min(attempt - 1, delays.length - 1)] + Math.floor(Math.random() * 15)) * 1000)
}

async function updateDigestRunCheckpoint(runId: string, values: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.from('weekly_digest_runs').update(values).eq('id', runId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Weekly digest run checkpoint update affected no rows')
}

async function processScan(job: BackgroundJob) {
  const payload = job.payload || {}
  const weekStart = String(payload.week_start || '')
  const after = typeof payload.after_client_id === 'string' ? payload.after_client_id : null
  if (!job.run_id || !weekStart) throw new Error('Malformed weekly digest scan payload')
  let query = supabaseAdmin.from('clients').select('id,email,company_name,plan').eq('active', true).in('plan', ['growth', 'pro']).not('email', 'is', null).order('id', { ascending: true }).limit(PAGE_SIZE)
  if (after) query = query.gt('id', after)
  const { data: clients, error } = await query
  if (error) throw error
  const list = clients || []
  if (list.length) {
    const { error: enqueueError } = await supabaseAdmin.from('background_jobs').upsert(
      list.map((client) => ({ job_type: 'weekly_digest_delivery', dedupe_key: `weekly-digest:${weekStart}:${client.id}`, run_id: job.run_id, client_id: client.id, payload: { week_start: weekStart }, priority: 100 })),
      { onConflict: 'job_type,dedupe_key', ignoreDuplicates: true },
    )
    if (enqueueError) throw enqueueError
  }
  const last = list.at(-1)?.id as string | undefined
  if (last && list.length === PAGE_SIZE) {
    await enqueueJob({ jobType: 'weekly_digest_scan', dedupeKey: `weekly-digest-scan:${weekStart}:${last}`, runId: job.run_id, payload: { week_start: weekStart, after_client_id: last }, priority: 10 })
    await updateDigestRunCheckpoint(job.run_id, { scan_cursor: last, updated_at: new Date().toISOString() })
  } else {
    await updateDigestRunCheckpoint(job.run_id, { scan_cursor: last || after, scan_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }
  return { scanned: list.length, queued: list.length }
}

async function processDelivery(job: BackgroundJob) {
  if (!job.client_id || !job.run_id) throw new Error('Malformed weekly digest delivery payload')
  const { data: run, error: runError } = await supabaseAdmin.from('weekly_digest_runs').select('week_start,period_start,period_end,previous_start').eq('id', job.run_id).single()
  if (runError || !run) throw runError || new Error('Digest run not found')
  const { data: client, error: clientError } = await supabaseAdmin.from('clients').select('id,email,company_name,plan,active').eq('id', job.client_id).maybeSingle()
  if (clientError) throw clientError
  if (!client?.active || !client.email || !['growth', 'pro'].includes(client.plan)) return { status: 'skipped_ineligible' }
  return processScheduledDigest(client, { weekStart: run.week_start, periodStart: run.period_start, periodEnd: run.period_end, previousStart: run.previous_start }, `weekly-digest:${job.client_id}:${run.week_start}`)
}

export async function processBackgroundJob(job: BackgroundJob) {
  switch (job.job_type) {
    case 'weekly_digest_scan': return processScan(job)
    case 'weekly_digest_delivery': return processDelivery(job)
    default: throw new Error(`Unknown background job type: ${job.job_type}`)
  }
}

export async function runBackgroundWorker(options: { deadlineMs?: number; batchSize?: number } = {}) {
  const deadline = Date.now() + (options.deadlineMs ?? 240_000)
  const counts = { claimed: 0, succeeded: 0, retried: 0, dead: 0 }
  while (Date.now() < deadline) {
    // Claim no more than the concurrency we can start promptly; every lease
    // must have enough lifetime for the work that is actually in flight.
    const jobs = await claimBackgroundJobs(options.batchSize ?? MAX_CONCURRENCY, 300)
    if (!jobs.length) {
      const runIds = new Set<string>()
      const { data: activeRuns } = await supabaseAdmin.from('weekly_digest_runs').select('id').eq('status', 'running').limit(50)
      for (const run of activeRuns || []) runIds.add(run.id)
      for (const runId of runIds) { try { await reconcileWeeklyDigestRun(runId) } catch (error) { logError('[background-worker] run reconciliation failed:', error) } }
      break
    }
    counts.claimed += jobs.length
    for (let i = 0; i < jobs.length; i += MAX_CONCURRENCY) {
      const chunk = jobs.slice(i, i + MAX_CONCURRENCY)
      await Promise.all(chunk.map(async (job) => {
        if (!job.lock_token) return
        try {
          const result = await processBackgroundJob(job)
          const completed = await completeBackgroundJob(job.id, job.lock_token, result && typeof result === 'object' ? result as Record<string, unknown> : {})
          if (!completed) { logWarn('[background-worker]', { event: 'lease_lost', job_id: job.id, job_type: job.job_type }); return }
          if (job.run_id) { try { await reconcileWeeklyDigestRun(job.run_id) } catch (error) { logError('[background-worker] run reconciliation failed:', error) } }
          counts.succeeded++
          logInfo('[background-worker]', { event: 'job_succeeded', job_id: job.id, job_type: job.job_type, run_id: job.run_id, client_id: job.client_id, attempt: job.attempts })
        } catch (error) {
          const message = safeErrorMessage(error)
          const dead = job.attempts >= job.max_attempts
          const failed = await failBackgroundJob(job.id, job.lock_token, message, retryAt(job.attempts))
          if (!failed) { logWarn('[background-worker]', { event: 'lease_lost', job_id: job.id, job_type: job.job_type }); return }
          if (job.run_id) { try { await reconcileWeeklyDigestRun(job.run_id) } catch (error) { logError('[background-worker] run reconciliation failed:', error) } }
          if (dead) counts.dead++; else counts.retried++
          logError('[background-worker]', { event: dead ? 'job_dead' : 'job_retry', job_id: job.id, job_type: job.job_type, run_id: job.run_id, client_id: job.client_id, attempt: job.attempts, error: message.slice(0, 200) })
        }
      }))
    }
  }
  return counts
}
