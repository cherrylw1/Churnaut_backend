import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd())
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const baseline = read('supabase/schema.sql')
const rlsMigration = read('supabase/migrations/20260908060000_rls_advisor_cleanup.sql')
const vectorMigration = read('supabase/migrations/20260908061000_vector_extension_schema.sql')

describe('Supabase advisory guardrails', () => {
  it('uses init-plan friendly auth.uid() expressions in the baseline policies', () => {
    const sql = baseline.replace(/--.*$/gm, '')
    expect(sql).not.toMatch(/(?:=|\()\s*auth\.uid\(\)/)
    expect(sql).toContain('(select auth.uid())')
  })

  it('does not keep redundant SELECT and FOR ALL policies for managed tables', () => {
    const managedTables = [
      'sessions',
      'routing_rules',
      'webhook_mappings',
      'crm_tokens',
      'weekly_digests',
      'deal_scores',
      'pipeline_snapshots',
      'scout_nudges',
      'company_deal_patterns',
      'deal_obituaries',
      'icp_profiles',
    ]

    for (const table of managedTables) {
      expect(baseline).not.toContain(`Clients can view their own ${table.replaceAll('_', ' ')}`)
      expect(baseline).toContain(`Clients can manage their own ${table.replaceAll('_', ' ')}`)
    }
  })

  it('protects service-only and optional embedding tables with RLS', () => {
    expect(baseline).toContain('ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;')
    expect(baseline).toContain('ALTER TABLE playbook_templates ENABLE ROW LEVEL SECURITY;')
    for (const table of ['processed_webhooks', 'playbook_templates', 'code_embeddings', 'support_embeddings']) {
      expect(rlsMigration).toContain(`ALTER TABLE IF EXISTS public.${table} ENABLE ROW LEVEL SECURITY`)
    }
  })

  it('keeps the baseline table definitions ahead of their RLS statements', () => {
    const tableStart = baseline.indexOf('CREATE TABLE IF NOT EXISTS playbook_templates')
    const rlsEnable = baseline.indexOf('ALTER TABLE playbook_templates ENABLE ROW LEVEL SECURITY')
    expect(tableStart).toBeGreaterThanOrEqual(0)
    expect(rlsEnable).toBeGreaterThan(tableStart)
  })

  it('keeps standalone helper upgrades idempotent and advisor-safe', () => {
    const helperExpectations: Record<string, string[]> = {
      'supabase/ai-insights.sql': [
        'Clients can view their own anomaly alerts',
        'Clients can update their own anomaly alerts',
        'Clients can view their own weekly digests',
        'Clients can manage their own weekly digests',
      ],
      'supabase/scout.sql': [
        'Clients can view their own deal scores',
        'Clients can manage their own deal scores',
        'Clients can view their own pipeline snapshots',
        'Clients can manage their own pipeline snapshots',
        'Clients can view their own scout nudges',
        'Clients can manage their own scout nudges',
      ],
      'supabase/patterns.sql': [
        'Clients can view their own company deal patterns',
        'Clients can manage their own company deal patterns',
      ],
      'supabase/obituaries.sql': [
        'Clients can view their own deal obituaries',
        'Clients can manage their own deal obituaries',
      ],
      'supabase/icp.sql': [
        'Clients can view their own icp profiles',
        'Clients can manage their own icp profiles',
      ],
    }

    for (const [file, removedReadPolicies] of Object.entries(helperExpectations)) {
      const sql = read(file).replace(/--.*$/gm, '')
      expect(sql).not.toMatch(/(?:=|\()\s*auth\.uid\(\)/)
      expect(sql).toMatch(/DROP POLICY IF EXISTS/)
      for (const policy of removedReadPolicies) {
        expect(sql).toMatch(new RegExp(`DROP POLICY IF EXISTS \\\"${policy}\\\"`))
      }
    }
  })

  it('protects helper-level RLS and service-role vector access invariants', () => {
    expect(read('supabase/playbooks.sql')).toContain('ALTER TABLE playbook_templates ENABLE ROW LEVEL SECURITY;')
    expect(baseline).toContain('GRANT USAGE ON SCHEMA extensions TO service_role;')
    expect(vectorMigration).toContain('GRANT USAGE ON SCHEMA extensions TO service_role;')
    expect(baseline).toContain('insufficient_privilege')
    expect(vectorMigration).toContain('insufficient_privilege')
  })

  it('guards optional feature-table policy upgrades', () => {
    expect(rlsMigration).toContain("to_regclass('public.anomaly_alerts')")
    expect(rlsMigration).toContain("to_regclass(format('public.%I', policy_row.table_name))")
  })

  it('moves pgvector to the extensions schema when the installation permits it', () => {
    expect(vectorMigration).toContain('CREATE SCHEMA IF NOT EXISTS extensions')
    expect(vectorMigration).toContain('ALTER EXTENSION vector SET SCHEMA extensions')
    expect(vectorMigration).toContain("p.proname IN ('match_code_chunks', 'match_support_chunks')")
    expect(vectorMigration).toContain('SET search_path = public, extensions, pg_temp')
    expect(baseline).toContain('ALTER EXTENSION vector SET SCHEMA extensions')
  })
})
