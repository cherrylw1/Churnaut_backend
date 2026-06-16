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

    it('should return a 403 response if user plan is null and pro is required', () => {
      const response = planGate(null, 'pro')
      expect(response).toBeInstanceOf(NextResponse)
      expect(response?.status).toBe(403)
    })

    it('should return null if user has pro plan and pro is required', () => {
      const response = planGate('pro', 'pro')
      expect(response).toBeNull()
    })
  })
})
