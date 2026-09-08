import { assertStagingConfig, assertExplicitAppEnvironment } from '../../lib/environment.ts'
import { supabaseAdmin } from '../../lib/supabase.ts'

async function main() {
  assertStagingConfig()
  assertExplicitAppEnvironment()
  if (process.env.STAGING_SEED_CONFIRM !== 'true') { console.log('Synthetic seed is ready. Set STAGING_SEED_CONFIRM=true to write staging-only fixtures.'); return }
  const { error } = await supabaseAdmin.from('clients').upsert({ company_name: 'Churnaut Synthetic E2E', domain: 'https://synthetic-e2e.invalid', email: 'synthetic-e2e@example.invalid', plan: 'starter', active: true, is_test_data: true }, { onConflict: 'domain' })
  if (error) throw error
  console.log('Synthetic staging tenant seeded.')
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Staging seed failed'); process.exitCode = 1 })
