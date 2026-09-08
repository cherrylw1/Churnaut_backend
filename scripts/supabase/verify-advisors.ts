import { supabaseAdmin } from '../../lib/supabase.ts'

const { data, error } = await supabaseAdmin.rpc('verify_supabase_advisor_state')
if (error) {
  console.error(`Supabase advisor verification failed: ${error.message}`)
  process.exitCode = 1
} else {
  const checks = (data ?? []) as { check_name: string; ready: boolean; detail: string }[]
  const failures = checks.filter((check) => !check.ready)
  if (failures.length) {
    console.error('Supabase advisor verification FAILED')
    for (const check of failures) console.error(`- ${check.check_name}: ${check.detail}`)
    process.exitCode = 1
  } else {
    console.log(`Supabase advisor verification PASS (${checks.length} checks)`)
  }
}
