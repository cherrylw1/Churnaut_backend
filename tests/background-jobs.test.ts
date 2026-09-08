import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkerConcurrency } from '@/lib/background/worker'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('durable background digest queue', () => {
  it('defines additive queue tables, leases, dedupe, and service-only RPCs', () => {
    const migration = read('supabase/migrations/20260908063000_background_job_queue.sql')
    for (const term of ['weekly_digest_runs', 'background_jobs', 'FOR UPDATE SKIP LOCKED', 'background_jobs_dedupe_unique', 'requeue_background_job', 'REVOKE ALL']) expect(migration).toContain(term)
  })

  it('keeps the weekly cron fast and schedules the bounded worker', () => {
    expect(read('app/api/cron/scout-digest/route.ts')).not.toContain('for (const client of clients)')
    expect(read('app/api/cron/scout-digest/route.ts')).toContain('startWeeklyDigestRun')
    expect(read('app/api/cron/background-worker/route.ts')).toContain('runBackgroundWorker')
    expect(read('vercel.json')).toContain('/api/cron/background-worker')
  })

  it('dispatches only known job types and contains retry/dead-letter controls', () => {
    const worker = read('lib/background/worker.ts')
    expect(worker).toContain("case 'weekly_digest_scan'")
    expect(worker).toContain("case 'weekly_digest_delivery'")
    expect(worker).toContain('Unknown background job type')
    expect(worker).toContain('failBackgroundJob')
    expect(worker).toContain('MAX_CONCURRENCY')
    expect(worker).toContain('options.batchSize ?? MAX_CONCURRENCY')
    expect(worker).toContain('run reconciliation failed')
    expect(worker).toContain("event: 'lease_lost'")
    expect(worker).toContain('priority: 10')
    expect(worker).toContain('async function updateDigestRunCheckpoint')
    expect(worker).toContain(".select('id').maybeSingle()")
    expect(worker).toContain("Weekly digest run checkpoint update affected no rows")
    expect((worker.match(/updateDigestRunCheckpoint\(job\.run_id/g) || []).length).toBe(2)
    expect(parseWorkerConcurrency('foo')).toBe(2)
    expect(parseWorkerConcurrency('0')).toBe(2)
    expect(parseWorkerConcurrency('3')).toBe(3)
  })

  it('uses deterministic email idempotency keys and keeps manual digest synchronous', () => {
    expect(read('lib/email/resend.ts')).toContain('idempotencyKey')
    expect(read('lib/email/resend.ts')).toContain("idempotencyKey } : undefined")
    expect(read('lib/background/worker.ts')).toContain('weekly-digest:${job.client_id}:${run.week_start}')
    expect(read('app/api/ai/digest/route.ts')).not.toContain('background_jobs')
  })

  it('keeps baseline queue semantics aligned with the migration', () => {
    const migration = read('supabase/migrations/20260908063000_background_job_queue.sql')
    const baseline = read('supabase/schema.sql')
    for (const term of ['background_jobs_client_type_idx', 'reconcile_weekly_digest_run', "priority) VALUES('weekly_digest_scan'"]) expect(migration + baseline).toContain(term)
    expect(baseline).toContain('was_created')
    expect(migration).not.toContain('r.created_at = r.updated_at')
  })

  it('protects scheduled/manual digest races and avoids recipient-bearing logs', () => {
    const scheduled = read('lib/digest/scheduled.ts')
    const manual = read('app/api/ai/digest/route.ts')
    const email = read('lib/email/resend.ts')
    expect(scheduled).toContain("existing?.delivery_status === 'sent' && existing.sent_at")
    expect(scheduled).toContain(".eq('delivery_status', 'sent').is('sent_at', null)")
    expect(scheduled).toContain("claimQuery.eq('delivery_status', existing.delivery_status)")
    expect(scheduled).toContain("claimQuery.is('claimed_at', null)")
    expect(scheduled).toContain(".eq('claimed_at', claimTimestamp)")
    expect(scheduled).toContain("claimed_at: claimTimestamp")
    expect(manual).toContain("scheduledDigest?.delivery_status === 'processing'")
    expect(email).not.toContain('Weekly digest sent successfully to ${to}')
    expect(email).toContain("category: error instanceof Error ? error.name : 'unknown'")
  })
})
