import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260909011000_log_privacy_retention.sql'), 'utf8')
const baseline = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8')

describe('log privacy contract', () => {
  it('scrubs and removes historical raw log fields', () => {
    expect(migration).toContain("UPDATE public.llm_logs")
    expect(migration).toContain("DROP COLUMN IF EXISTS input_payload")
    expect(migration).toContain("metadata = COALESCE(metadata, '{}'::jsonb) - 'payload' - 'transformed'")
    expect(baseline).toContain('metadata jsonb NOT NULL DEFAULT')
    expect(baseline).not.toMatch(/\n\s*system_prompt\s+text/)
    expect(baseline).not.toMatch(/\n\s*input_payload\s+jsonb/)
    expect(baseline).not.toMatch(/\n\s*output_payload\s+jsonb/)
  })

  it('keeps retention access service-role-only and bounded', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.purge_sensitive_logs')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.purge_sensitive_logs')
    expect(migration).toContain('interaction_days < 7 OR interaction_days > 365')
    expect(migration).toContain('telemetry_days < 30 OR telemetry_days > 730')
  })

  it('does not persist raw AI or webhook objects in application code', () => {
    const logger = fs.readFileSync(path.join(root, 'lib/llm/logger.ts'), 'utf8')
    const webhook = fs.readFileSync(path.join(root, 'app/api/webhook/route.ts'), 'utf8')
    expect(logger).not.toContain('input_payload:')
    expect(logger).not.toContain('output_payload:')
    expect(webhook).not.toContain('payload, transformed')
  })
})
