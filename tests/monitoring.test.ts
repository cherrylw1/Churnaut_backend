import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
const root = process.cwd(); const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8')
describe('operational monitoring contract', () => {
  it('has service-only monitoring schema and safe event allowlist', () => { const sql = read('supabase/migrations/20260909012000_ops_monitoring.sql'); expect(sql).toContain('ops_events'); expect(sql).toContain('service_heartbeats'); expect(sql).toContain('ops_alert_state'); expect(sql).toContain('REVOKE ALL ON TABLE'); expect(read('lib/monitoring/events.ts')).not.toContain('request_body') })
  it('keeps public health minimal and founder ops protected', () => { expect(read('app/api/health/route.ts')).not.toMatch(/supabase|customer|queue|secret/i); expect(read('app/api/founder/ops/route.ts')).toContain("!== 'founder'") })
  it('uses stable alert keys and cooldown RPCs', () => { const e = read('lib/monitoring/evaluate.ts'); const sql = read('supabase/migrations/20260909012000_ops_monitoring.sql'); expect(e).toContain('auth:failure_spike'); expect(sql).toContain('claim_ops_alert_notification'); expect(sql).toContain('purge_ops_monitoring') })
  it('records only coarse login failure categories', () => { const route = read('app/api/ops/auth-failure/route.ts'); expect(route).toContain('authFailureRequestSchema'); expect(route).not.toMatch(/access_token|request_body/i); expect(read('app/login/page.tsx')).toContain('/api/ops/auth-failure') })
  it('keeps alert notification content aggregate-only', () => { const n = read('lib/monitoring/notifier.ts'); expect(n).toContain('contains no customer data'); expect(n).not.toMatch(/access_token|password|customer email/i) })
  it('fails closed on monitoring query errors and keeps AI outages open without traffic', () => { const e = read('lib/monitoring/evaluate.ts'); expect(e).toContain('Monitoring state query failed'); expect(e).toContain('openAiAlerts'); expect(e).toContain('background:queue_backlog') })
  it('keeps low-volume failed AI requests open during recovery', () => { const e = read('lib/monitoring/evaluate.ts'); expect(e).toContain('const active = warning || (openAiAlerts.has(key) && !recovery)'); expect(e).toContain('pauseSuppressed') })
  it('uses schedule-aware heartbeat freshness', () => { expect(read('lib/monitoring/evaluate.ts')).toContain("'reset-visits': 35 * 24 * 60 * 60_000") })
  it('keeps staging external integration callbacks guarded', () => { expect(read('app/api/oauth/hubspot/callback/route.ts')).toContain('stagingIntegrationsEnabled'); expect(read('app/api/oauth/calendly/callback/route.ts')).toContain('stagingIntegrationsEnabled') })
  it('timestamps initially resolved alerts for retention', () => { expect(read('supabase/migrations/20260909012000_ops_monitoring.sql')).toContain("CASE WHEN active_input THEN NULL ELSE now() END") })
  it('does not advance successful heartbeat at cron attempt start', () => { expect(read('lib/monitoring/heartbeat.ts')).toContain('touchHeartbeatAttempt'); expect(read('app/api/cron/reset-visits/route.ts')).toContain('touchHeartbeatAttempt') })
})
