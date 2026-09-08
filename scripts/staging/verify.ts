import { assertStagingConfig, assertExplicitAppEnvironment, getAppEnvironment } from '../../lib/environment.ts'
import { supabaseAdmin } from '../../lib/supabase.ts'

async function main() {
  assertStagingConfig()
  assertExplicitAppEnvironment()
  if (getAppEnvironment() !== 'staging') throw new Error('Staging verification requires APP_ENV=staging')
  const base = process.env.E2E_BASE_URL?.replace(/\/$/, '')
  if (base) {
    const response = await fetch(`${base}/api/health`)
    if (!response.ok) throw new Error(`Staging health check failed (${response.status})`)
    const payload = await response.json() as { environment?: string; version?: string }
    if (payload.environment !== 'staging') throw new Error('Remote health endpoint is not reporting staging')
    if (process.env.EXPECTED_GIT_SHA && payload.version !== process.env.EXPECTED_GIT_SHA) throw new Error('Remote deployment SHA does not match expected Git SHA')
  }
  if (process.env.STAGING_VERIFY_REMOTE === 'true') {
    const { count, error } = await supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('is_test_data', false)
    if (error) throw error
    if ((count ?? 0) > 0) throw new Error(`Staging contains ${count} non-test tenant row(s)`)
  }
  console.log('Staging configuration verified; no production resources or tenant data were accessed.')
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Staging verification failed'); process.exitCode = 1 })
