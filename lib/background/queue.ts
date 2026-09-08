import { supabaseAdmin } from '@/lib/supabase'

export type BackgroundJob = {
  id: string; job_type: string; dedupe_key: string; run_id: string | null; client_id: string | null
  payload: Record<string, unknown>; status: string; attempts: number; max_attempts: number; lock_token: string | null
}

export async function startWeeklyDigestRun(input: { weekStart: string; periodStart: string; periodEnd: string; previousStart: string }) {
  const { data, error } = await supabaseAdmin.rpc('start_weekly_digest_run', {
    week_start_input: input.weekStart, period_start_input: input.periodStart, period_end_input: input.periodEnd, previous_start_input: input.previousStart,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.run_id) throw new Error('Weekly digest run could not be started')
  return { runId: row.run_id as string, created: Boolean(row.created) }
}

export async function claimBackgroundJobs(limit = 10, leaseSeconds = 240): Promise<BackgroundJob[]> {
  const { data, error } = await supabaseAdmin.rpc('claim_background_jobs', { limit_input: limit, lease_seconds_input: leaseSeconds })
  if (error) throw error
  return (data || []) as BackgroundJob[]
}

export async function completeBackgroundJob(jobId: string, lockToken: string, result: Record<string, unknown> = {}) {
  const { data, error } = await supabaseAdmin.rpc('complete_background_job', { job_id_input: jobId, lock_token_input: lockToken, result_input: result })
  if (error) throw error
  return Boolean(data)
}

export async function failBackgroundJob(jobId: string, lockToken: string, message: string, retryAt: Date) {
  const { data, error } = await supabaseAdmin.rpc('fail_background_job', { job_id_input: jobId, lock_token_input: lockToken, error_input: message.slice(0, 500), retry_at_input: retryAt.toISOString() })
  if (error) throw error
  return Boolean(data)
}

export async function enqueueJob(job: { jobType: string; dedupeKey: string; runId?: string | null; clientId?: string | null; payload?: Record<string, unknown>; priority?: number }) {
  const { data, error } = await supabaseAdmin.from('background_jobs').insert({ job_type: job.jobType, dedupe_key: job.dedupeKey, run_id: job.runId || null, client_id: job.clientId || null, payload: job.payload || {}, priority: job.priority ?? 100 }).select('id').maybeSingle()
  if (error && error.code !== '23505') throw error
  return data?.id as string | undefined
}

export async function reconcileWeeklyDigestRun(runId: string) {
  const { data, error } = await supabaseAdmin.rpc('reconcile_weekly_digest_run', { run_id_input: runId })
  if (error) throw error
  return data as string
}
