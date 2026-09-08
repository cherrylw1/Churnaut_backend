import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { getAppOrigin } from '@/lib/app-origin'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('disaster recovery contract', () => {
  it('passes the repository DR audit', () => {
    const output = execFileSync('node', ['--experimental-strip-types', 'scripts/dr/audit.ts'], { cwd: root, encoding: 'utf8' })
    expect(output).toContain('DR audit PASS')
  })

  it('smoke-loads the read-only restore verifier without contacting a provider', () => {
    const result = spawnSync('node', ['--experimental-strip-types', 'scripts/dr/verify-restore.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', DR_APP_URL: '' },
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  })

  it('keeps OAuth origins configurable and rejects unsafe values', () => {
    const original = process.env.APP_ORIGIN
    process.env.APP_ORIGIN = 'https://recovery.example.test/'
    expect(getAppOrigin()).toBe('https://recovery.example.test')
    process.env.APP_ORIGIN = 'not-an-origin'
    expect(() => getAppOrigin()).toThrow('APP_ORIGIN must be a valid http(s) origin')
    if (original === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = original
  })

  it('guards storage assumptions, environment inventory, and secret-safe docs', () => {
    const runbook = read('docs/runbooks/disaster-recovery.md')
    const verify = read('scripts/dr/verify-restore.ts')
    const audit = read('scripts/dr/audit.ts')
    expect(runbook).toContain('ENCRYPTION_KEY')
    expect(runbook).toContain('restore drill')
    expect(runbook).toContain('Supabase Storage')
    expect(verify).toContain('read-only')
    expect(verify).toContain('code_embeddings')
    expect(verify).toContain("['webhook_mappings', 'id']")
    expect(verify).toContain("['deal_scores', 'id']")
    expect(verify).toContain("['pipeline_snapshots', 'id']")
    expect(verify).toContain("['scout_nudges', 'id']")
    expect(audit).toContain("sourceRoots = ['app', 'lib', 'scripts', 'components', 'hooks']")
    expect(audit).toContain("git', ['ls-files']")
    expect(verify).not.toContain('sendWeeklyDigest')
    expect(audit).toContain('supabase\\.storage')
    expect(audit).toContain('process.env.')
    expect(runbook).not.toMatch(/-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----/)
  })

  it('uses APP_ORIGIN in all active OAuth callback flows', () => {
    for (const file of [
      'app/api/oauth/hubspot/route.ts', 'app/api/oauth/hubspot/callback/route.ts',
      'app/api/oauth/calendly/route.ts', 'app/api/oauth/calendly/callback/route.ts',
      'lib/integrations/hubspot-pipeline.ts',
    ]) {
      const source = read(file)
      expect(source).toContain('getAppOrigin')
      expect(source).not.toContain('https://app.churnaut.com/api/oauth/')
    }
  })
})
