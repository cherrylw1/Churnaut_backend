import { describe, expect, it } from 'vitest'
import { planGate } from '@/lib/gate'
import { NextResponse } from 'next/server'

describe('Gate module tests', () => {
  describe('planGate', () => {
    it('should return a 403 response if user has starter plan and growth is required', () => {
      const response = planGate('starter', 'growth')
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(403)
    })

    it('should return null if user has growth plan and growth is required', () => {
      const response = planGate('growth', 'growth')
      expect(response).toBeNull()
    })

    it('should return null if user has pro plan and growth is required', () => {
      const response = planGate('pro', 'growth')
      expect(response).toBeNull()
    })

    it('should defer null-plan handling to the route auth check', () => {
      const response = planGate(null, 'pro')
      expect(response).toBeNull()
    })

    it('should return null if user has pro plan and pro is required', () => {
      const response = planGate('pro', 'pro')
      expect(response).toBeNull()
    })

    it('does not disguise account lookup failures as upgrade prompts', () => {
      expect(planGate('missing_client', 'growth')?.status).toBe(404)
      expect(planGate('plan_unavailable', 'growth')?.status).toBe(503)
      expect(planGate('account_inactive', 'growth')?.status).toBe(403)
    })
  })
})
