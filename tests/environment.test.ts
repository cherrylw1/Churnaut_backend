import { describe, expect, it, afterEach } from 'vitest'
import { assertStagingConfig, assertStagingDatabaseUrl, assertExplicitAppEnvironment, canSendEmail, getAppEnvironment } from '@/lib/environment'

const original = { appEnv: process.env.APP_ENV, appOrigin: process.env.APP_ORIGIN, staging: process.env.STAGING_SUPABASE_PROJECT_REF, production: process.env.PRODUCTION_SUPABASE_PROJECT_REF, url: process.env.NEXT_PUBLIC_SUPABASE_URL, vercel: process.env.VERCEL, db: process.env.STAGING_DATABASE_URL }
afterEach(() => { for (const [key, value] of Object.entries({ APP_ENV: original.appEnv, APP_ORIGIN: original.appOrigin, STAGING_SUPABASE_PROJECT_REF: original.staging, PRODUCTION_SUPABASE_PROJECT_REF: original.production, NEXT_PUBLIC_SUPABASE_URL: original.url, VERCEL: original.vercel, STAGING_DATABASE_URL: original.db })) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })

describe('logical environment contract', () => {
  it('requires distinct staging resources and non-production origin', () => {
    process.env.APP_ENV = 'staging'; process.env.APP_ORIGIN = 'https://staging.example.test'; process.env.STAGING_SUPABASE_PROJECT_REF = 'stage'; process.env.PRODUCTION_SUPABASE_PROJECT_REF = 'prod'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stage.supabase.co'
    expect(getAppEnvironment()).toBe('staging'); expect(assertStagingConfig()).toBe(true)
  })
  it('blocks non-allowlisted staging email', () => { process.env.APP_ENV = 'staging'; delete process.env.NON_PROD_EMAIL_ALLOWLIST; expect(canSendEmail('owner@example.com')).toBe(false) })
  it('requires explicit logical environment on hosted deployments', () => { delete process.env.APP_ENV; process.env.VERCEL = '1'; expect(() => assertExplicitAppEnvironment()).toThrow() })
  it('rejects a hostname that only contains the staging ref', () => { process.env.APP_ENV = 'staging'; process.env.APP_ORIGIN = 'https://staging.example.test'; process.env.STAGING_SUPABASE_PROJECT_REF = 'stage'; process.env.PRODUCTION_SUPABASE_PROJECT_REF = 'prod'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stage.supabase.co.attacker.test'; expect(() => assertStagingConfig()).toThrow() })
  it('rejects the production origin even with a trailing slash', () => { process.env.APP_ENV = 'staging'; process.env.APP_ORIGIN = 'https://app.churnaut.com/'; process.env.STAGING_SUPABASE_PROJECT_REF = 'stage'; process.env.PRODUCTION_SUPABASE_PROJECT_REF = 'prod'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stage.supabase.co'; expect(() => assertStagingConfig()).toThrow() })
  it('requires a database URL that identifies staging and rejects production', () => {
    process.env.STAGING_SUPABASE_PROJECT_REF = 'stage123'; process.env.PRODUCTION_SUPABASE_PROJECT_REF = 'prod123'
    expect(() => assertStagingDatabaseUrl('postgresql://postgres.prod123@pooler.supabase.com/db')).toThrow(/production/)
    expect(() => assertStagingDatabaseUrl('postgresql://postgres@pooler.supabase.com/db')).toThrow(/staging project ref/)
    expect(assertStagingDatabaseUrl('postgresql://postgres.stage123@pooler.supabase.com/db')).toBe(true)
  })
})
