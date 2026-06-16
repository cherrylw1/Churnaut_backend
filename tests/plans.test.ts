import { describe, expect, it } from 'vitest'
import {
  VARIANT_TO_PLAN,
  PLAN_LIMITS,
  getPlanLimits,
  canAccessFeature,
} from '@/lib/plans'

describe('Plans module tests', () => {
  describe('getPlanLimits', () => {
    it('should return starter limits when plan is null', () => {
      const limits = getPlanLimits(null)
      expect(limits).toBe(PLAN_LIMITS.starter)
      expect(limits.tracked_visits).toBe(500)
    })

    it('should return growth limits when plan is growth', () => {
      const limits = getPlanLimits('growth')
      expect(limits).toBe(PLAN_LIMITS.growth)
      expect(limits.tracked_visits).toBe(5000)
    })

    it('should return pro limits when plan is pro', () => {
      const limits = getPlanLimits('pro')
      expect(limits).toBe(PLAN_LIMITS.pro)
      expect(limits.tracked_visits).toBe(Infinity)
    })
  })

  describe('canAccessFeature', () => {
    it('should control access to scout_ai', () => {
      expect(canAccessFeature(null, 'scout_ai')).toBe(false)
      expect(canAccessFeature('starter', 'scout_ai')).toBe(false)
      expect(canAccessFeature('growth', 'scout_ai')).toBe(true)
      expect(canAccessFeature('pro', 'scout_ai')).toBe(true)
    })

    it('should check boolean and numeric and array values properly', () => {
      // boolean check (bulk_csv)
      expect(canAccessFeature('starter', 'bulk_csv')).toBe(false)
      expect(canAccessFeature('growth', 'bulk_csv')).toBe(true)

      // numeric check (tracked_visits)
      expect(canAccessFeature('starter', 'tracked_visits')).toBe(true) // 500 > 0
      expect(canAccessFeature('pro', 'tracked_visits')).toBe(true) // Infinity > 0

      // array check (crms)
      expect(canAccessFeature('starter', 'crms')).toBe(true)
    })
  })

  describe('VARIANT_TO_PLAN mappings', () => {
    it('should map variant IDs to expected plans', () => {
      expect(VARIANT_TO_PLAN['1757564']).toBe('starter')
      expect(VARIANT_TO_PLAN['1757539']).toBe('starter')
      expect(VARIANT_TO_PLAN['1757578']).toBe('growth')
      expect(VARIANT_TO_PLAN['1757543']).toBe('growth')
      expect(VARIANT_TO_PLAN['1757573']).toBe('pro')
      expect(VARIANT_TO_PLAN['1757550']).toBe('pro')
    })
  })
})
