export type AppEnvironment = 'development' | 'staging' | 'production'
const PROD_ORIGIN = 'https://app.churnaut.com'

export function getAppEnvironment(): AppEnvironment {
  const configured = process.env.APP_ENV?.trim().toLowerCase()
  if (process.env.VERCEL && !configured) throw new Error('APP_ENV must be explicitly configured on hosted deployments')
  if (configured === 'development' || configured === 'staging' || configured === 'production') return configured
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}
export function assertExplicitAppEnvironment() {
  if (process.env.VERCEL && !process.env.APP_ENV) throw new Error('APP_ENV must be explicitly configured on hosted deployments')
  return true
}

export function isStaging() { return getAppEnvironment() === 'staging' }
export function isProduction() { return getAppEnvironment() === 'production' }
export function getNonProdAllowlist() { return new Set((process.env.NON_PROD_EMAIL_ALLOWLIST ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)) }
export function canSendEmail(to: string) { return !isStaging() || getNonProdAllowlist().has(to.trim().toLowerCase()) }
export function billingMode(): 'disabled' | 'test' | 'live' { const mode = (process.env.BILLING_MODE ?? (isProduction() ? 'live' : 'disabled')).toLowerCase(); return mode === 'test' || mode === 'live' ? mode : 'disabled' }
export function stagingCronsEnabled() { return !isStaging() || process.env.STAGING_CRONS_ENABLED === 'true' }
export function stagingIntegrationsEnabled() { return !isStaging() || process.env.STAGING_EXTERNAL_INTEGRATIONS_ENABLED === 'true' }

export function assertStagingDatabaseUrl(databaseUrl: string) {
  const stagingRef = process.env.STAGING_SUPABASE_PROJECT_REF
  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF
  if (!stagingRef || !productionRef || stagingRef === productionRef) throw new Error('Staging and production Supabase refs must be configured and different')
  let parsed: URL
  try { parsed = new URL(databaseUrl) } catch { throw new Error('STAGING_DATABASE_URL must be a valid PostgreSQL URL') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('STAGING_DATABASE_URL must use the PostgreSQL protocol')
  const target = [parsed.hostname, parsed.username, parsed.pathname].join(' ').toLowerCase()
  if (target.includes(productionRef.toLowerCase())) throw new Error('STAGING_DATABASE_URL points at the production project')
  if (!target.includes(stagingRef.toLowerCase())) throw new Error('STAGING_DATABASE_URL must identify the staging project ref')
  return true
}

export function assertStagingConfig() {
  if (!isStaging()) throw new Error('APP_ENV=staging is required')
  const origin = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN
  let parsedOrigin: URL
  try { parsedOrigin = new URL(origin || '') } catch { throw new Error('Staging APP_ORIGIN must be a valid origin') }
  if (parsedOrigin.origin === PROD_ORIGIN || !/^https?:\/\/[^/]+$/.test(parsedOrigin.origin)) throw new Error('Staging APP_ORIGIN must be a non-production origin')
  const stagingRef = process.env.STAGING_SUPABASE_PROJECT_REF
  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF
  if (!stagingRef || !productionRef || stagingRef === productionRef) throw new Error('Staging and production Supabase refs must be configured and different')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  let parsedSupabase: URL
  try { parsedSupabase = new URL(supabaseUrl) } catch { throw new Error('Supabase URL is invalid') }
  if (parsedSupabase.protocol !== 'https:' || parsedSupabase.hostname !== `${stagingRef}.supabase.co`) throw new Error('Supabase URL does not exactly match staging project ref')
  if (process.env.STAGING_DATABASE_URL) assertStagingDatabaseUrl(process.env.STAGING_DATABASE_URL)
  if (billingMode() === 'live') throw new Error('Live billing is forbidden in staging')
  return true
}
