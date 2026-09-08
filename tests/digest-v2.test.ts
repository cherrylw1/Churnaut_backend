import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDigestAggregate,
  selectBestRep,
  selectBestRule,
  selectTopSignal,
} from '@/lib/analytics/digest'
import { parseAnomalyAggregate } from '@/lib/analytics/anomaly'
import { parseScoutBriefOutput } from '@/lib/scout/analyst'
import { parseScoutScoreResult } from '@/lib/scout-scoring'

const fixture = {
  current: {
    links_created: 3,
    clicks: 12,
    conversions: 2,
    triggers: 8,
    signals: [
      { signal: 'google_ad', total: 5, converted: 1, rate: 0.2 },
      { signal: 'linkedin_ad', total: 4, converted: 2, rate: 0.5 },
    ],
    reps: [
      { rep: 'Asha', conversions: 1 },
      { rep: 'Ben', conversions: 3 },
    ],
    rules: [
      { rule_id: 'rule-a', triggers: 4 },
      { rule_id: 'rule-b', triggers: 7 },
    ],
  },
  previous: {
    links_created: 1,
    clicks: 2,
    conversions: 0,
    triggers: 3,
    signals: [],
    reps: [],
    rules: [],
  },
}

describe('digest v2 metrics', () => {
  it('validates the database payload and selects deterministic leaders', () => {
    const parsed = parseDigestAggregate(fixture)
    expect(parsed).not.toBeNull()
    expect(selectTopSignal(parsed!.current.signals)?.signal).toBe('linkedin_ad')
    expect(selectBestRep(parsed!.current.reps)?.rep).toBe('Ben')
    expect(selectBestRule(parsed!.current.rules)?.rule_id).toBe('rule-b')
  })

  it('rejects malformed aggregate payloads', () => {
    expect(parseDigestAggregate({ ...fixture, current: { clicks: -1 } })).toBeNull()
  })

  it('uses event-timed database aggregation in both digest routes', () => {
    const root = process.cwd()
    const manualRoute = fs.readFileSync(path.join(root, 'app/api/ai/digest/route.ts'), 'utf8')
    const cronRoute = fs.readFileSync(path.join(root, 'app/api/cron/scout-digest/route.ts'), 'utf8')
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260908010000_digest_v2_aggregate.sql'),
      'utf8'
    )

    expect(manualRoute).toContain("rpc(\n      'digest_v2_aggregate'")
    expect(cronRoute).toContain("rpc('digest_v2_aggregate'")
    expect(manualRoute).toContain('getPreviousUtcWeekRange()')
    expect(manualRoute).toContain('current_start_input: periodStart')
    expect(manualRoute).toContain('period_end_input: periodEnd')
    expect(manualRoute).toContain('`digest:${clientId}:${weekStartStr}`')
    expect(cronRoute).not.toContain('click_count')
    expect(migration).toContain("event.event_type IN ('page_view', 'link_clicked', 'conversion', 'rule_triggered')")
    expect(migration).toContain('event.created_at < period_end_input')
    expect(migration).toContain('session.client_id = client_id_input')
  })

  it('validates exact anomaly metrics and keeps detection POST-only', () => {
    expect(parseAnomalyAggregate({
      current: { visitors: 10, conversions: 2, rate: 0.2 },
      previous: { visitors: 10, conversions: 4, rate: 0.4 },
      rule_daily: [{ rule_id: 'rule-a', day: '2026-09-08', count: 3 }],
    })?.current.rate).toBe(0.2)
    expect(parseAnomalyAggregate({
      current: { visitors: -1, conversions: 0, rate: 0 },
      previous: { visitors: 0, conversions: 0, rate: 0 },
      rule_daily: [],
    })).toBeNull()

    const root = process.cwd()
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/ai/anomaly/route.ts'), 'utf8')
    const page = fs.readFileSync(path.join(root, 'app/dashboard/ai-insights/page.tsx'), 'utf8')
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260908020000_anomaly_v2_aggregate.sql'),
      'utf8'
    )
    expect(apiRoute).toContain("rpc(\n      'anomaly_v2_aggregate'")
    expect(apiRoute).not.toContain("from('sessions')")
    expect(page).toContain("fetch('/api/ai/anomaly', { method: 'POST' })")
    expect(page).not.toContain('anomaly?run=true')
    expect(migration).toContain("event.event_type IN ('page_view', 'conversion', 'rule_triggered')")
  })

  it('repeats tenant boundaries on Scout updates and trusted nudge lookup', () => {
    const root = process.cwd()
    const scoreRoute = fs.readFileSync(path.join(root, 'app/api/scout/score/route.ts'), 'utf8')
    const nudgeRoute = fs.readFileSync(path.join(root, 'app/api/scout/nudge/route.ts'), 'utf8')
    expect(scoreRoute).toMatch(/update\(updateRec\)[\s\S]*?\.eq\('id',[\s\S]*?\.eq\('client_id', clientId\)/)
    expect(nudgeRoute).toContain(".select('deal_name, rep_email, rep_name, draft_email, next_action')")
    expect(nudgeRoute).toMatch(/\.eq\('client_id', clientId\)[\s\S]*?\.eq\('deal_id', deal_id\)/)
    expect(nudgeRoute).toContain('sendNudgeEmail(repEmail, dealName')
    expect(nudgeRoute).not.toContain('sendNudgeEmail(rep_email')
  })

  it('rejects malformed or incomplete Scout model output', () => {
    expect(() => parseScoutBriefOutput({ score: 'maybe' })).toThrow()
    expect(() => parseScoutScoreResult({
      pipeline_pressure_score: 50,
      deals: [{
        deal_id: 'deal-a', deal_name: 'A', score: 'AMBER',
        primary_risk: 'Slow response', next_action: 'Call today', draft_email: null,
      }],
    }, ['deal-a', 'deal-b'])).toThrow()
    expect(parseScoutScoreResult({
      pipeline_pressure_score: 50,
      deals: [{
        deal_id: 'deal-a', deal_name: 'A', score: 'AMBER',
        primary_risk: 'Slow response', next_action: 'Call today', draft_email: 'discard me',
      }],
    }, ['deal-a']).deals[0].draft_email).toBeNull()
  })

  it('locks internal database functions and RAG tables to the service role', () => {
    const root = process.cwd()
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260908040000_function_privilege_hardening.sql'),
      'utf8'
    )
    expect(migration).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated')
    expect(migration).toContain("'match_code_chunks'")
    expect(migration).toContain('REVOKE ALL ON TABLE public.code_embeddings FROM anon, authenticated')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION %s TO service_role')
  })

  it('never teaches the removed public snippet-key webhook authentication', () => {
    const supportKnowledge = fs.readFileSync(path.join(process.cwd(), 'scripts/ingest-support.ts'), 'utf8')
    const founderKnowledge = fs.readFileSync(path.join(process.cwd(), 'scripts/ingest-context.ts'), 'utf8')
    expect(supportKnowledge).not.toContain('client_key=YOUR_KEY')
    expect(founderKnowledge).not.toContain('client_key={snippet_key}')
    expect(founderKnowledge).toContain('clients.webhook_secret')
  })
})
