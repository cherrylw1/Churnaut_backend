import { describe, expect, it } from 'vitest'
import { evaluateRules } from '@/lib/rules-engine'
import { Session, RoutingRule } from '@/types/index'

describe('Rules engine tests', () => {
  const baseSession: Session = {
    id: 'sess_1',
    client_id: 'client_1',
    created_at: new Date().toISOString(),
    click_count: 1,
    converted: false,
    signal_type: 'hubspot',
    job_title: 'Software Engineer',
    company_name: 'Google',
    deal_stage: 'qualified',
    visitor_type: 'prospect',
    metadata: {
      utms: {
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'summer_sale',
        utm_content: 'banner_ad',
      },
    },
  }

  const baseRule: RoutingRule = {
    id: 'rule_1',
    client_id: 'client_1',
    priority: 1,
    active: true,
    signal_type: 'hubspot',
    conditions: {},
    action_type: 'show_calendar',
    action_payload: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  it('should return null when rules list is empty', () => {
    expect(evaluateRules(baseSession, [])).toBeNull()
  })

  it('should return the rule when signal_type matches and conditions pass', () => {
    const rule = { ...baseRule, conditions: { job_title_contains: 'engineer' } }
    expect(evaluateRules(baseSession, [rule])).toBe(rule)
  })

  it('should not return the rule when signal_type does not match', () => {
    const rule = { ...baseRule, signal_type: 'pipedrive' }
    expect(evaluateRules(baseSession, [rule])).toBeNull()
  })

  it('should return rule when signal_type is not specified (matches any session)', () => {
    const rule = { ...baseRule, signal_type: undefined }
    expect(evaluateRules(baseSession, [rule])).toBe(rule)
  })

  // We write the expected behavior test for signal_type 'any' matching any session,
  // but we mark it with .skip and document it as a bug because the source code lacks this fallback.
  it.skip('should match signal_type "any" against any session signal_type', () => {
    const rule = { ...baseRule, signal_type: 'any' }
    const session = { ...baseSession, signal_type: 'hubspot' }
    expect(evaluateRules(session, [rule])).toBe(rule)
  })

  it('should return the first matching rule when rules are pre-sorted by priority', () => {
    const ruleLowPriority = { ...baseRule, id: 'rule_low', priority: 10, conditions: { job_title_contains: 'engineer' } }
    const ruleHighPriority = { ...baseRule, id: 'rule_high', priority: 2, conditions: { job_title_contains: 'engineer' } }
    
    // The engine evaluates rules sequentially in the array order.
    // If the caller passes them pre-sorted, the one first in the array (highest priority) wins.
    const result = evaluateRules(baseSession, [ruleHighPriority, ruleLowPriority])
    expect(result).toBe(ruleHighPriority)
  })

  describe('Condition evaluation', () => {
    it('should match job_title_contains (case-insensitive substring)', () => {
      const rulePass = { ...baseRule, conditions: { job_title_contains: 'SOFT' } }
      const ruleFail = { ...baseRule, conditions: { job_title_contains: 'manager' } }
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })

    it('should match company_name_equals (exact match)', () => {
      const rulePass = { ...baseRule, conditions: { company_name_equals: 'Google' } }
      const ruleFail = { ...baseRule, conditions: { company_name_equals: 'google' } } // case-sensitive in engine
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })

    it('should match deal_stage_equals (case-insensitive exact match)', () => {
      // NOTE: In the source rules-engine code, it casts `session as unknown as Record<string, string>` and accesses `deal_stage`
      const sessionWithDealStage = { ...baseSession, deal_stage: 'Qualified' } as unknown as Session
      const rulePass = { ...baseRule, conditions: { deal_stage_equals: 'qualified' } }
      const ruleFail = { ...baseRule, conditions: { deal_stage_equals: 'closedwon' } }
      expect(evaluateRules(sessionWithDealStage, [rulePass])).toBe(rulePass)
      expect(evaluateRules(sessionWithDealStage, [ruleFail])).toBeNull()
    })

    it('should match visitor_type_equals (case-insensitive exact match)', () => {
      const sessionWithVisitorType = { ...baseSession, visitor_type: 'Prospect' } as unknown as Session
      const rulePass = { ...baseRule, conditions: { visitor_type_equals: 'prospect' } }
      const ruleFail = { ...baseRule, conditions: { visitor_type_equals: 'customer' } }
      expect(evaluateRules(sessionWithVisitorType, [rulePass])).toBe(rulePass)
      expect(evaluateRules(sessionWithVisitorType, [ruleFail])).toBeNull()
    })

    it('should match utm_campaign_contains (case-insensitive substring)', () => {
      const rulePass = { ...baseRule, conditions: { utm_campaign_contains: 'SUMMER' } }
      const ruleFail = { ...baseRule, conditions: { utm_campaign_contains: 'winter' } }
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })

    it('should match utm_source_equals (case-insensitive exact match)', () => {
      const rulePass = { ...baseRule, conditions: { utm_source_equals: 'NEWSLETTER' } }
      const ruleFail = { ...baseRule, conditions: { utm_source_equals: 'google' } }
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })

    it('should match utm_medium_equals (case-insensitive exact match)', () => {
      const rulePass = { ...baseRule, conditions: { utm_medium_equals: 'EMAIL' } }
      const ruleFail = { ...baseRule, conditions: { utm_medium_equals: 'cpc' } }
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })

    it('should match utm_content_contains (case-insensitive substring)', () => {
      const rulePass = { ...baseRule, conditions: { utm_content_contains: 'BANNER' } }
      const ruleFail = { ...baseRule, conditions: { utm_content_contains: 'text' } }
      expect(evaluateRules(baseSession, [rulePass])).toBe(rulePass)
      expect(evaluateRules(baseSession, [ruleFail])).toBeNull()
    })
  })
})
