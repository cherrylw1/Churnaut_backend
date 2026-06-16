import { describe, expect, it } from 'vitest'
import crypto from 'crypto'
import {
  verifyWebhookSignature,
  getCustomClientId,
  getVariantId,
  getCustomerId,
  getSubscriptionId,
} from '@/lib/lemonsqueezy'

describe('Lemon Squeezy helper tests', () => {
  describe('verifyWebhookSignature', () => {
    const secret = 'my-webhook-secret'
    const payload = JSON.stringify({ event_name: 'subscription_created', data: { id: '123' } })
    const correctSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

    it('should verify correct signature', () => {
      expect(verifyWebhookSignature(payload, correctSignature, secret)).toBe(true)
    })

    it('should reject incorrect signature', () => {
      expect(verifyWebhookSignature(payload, 'wrong-signature', secret)).toBe(false)
    })

    it('should reject empty signature or empty secret', () => {
      expect(verifyWebhookSignature(payload, '', secret)).toBe(false)
      expect(verifyWebhookSignature(payload, correctSignature, '')).toBe(false)
      expect(verifyWebhookSignature(payload, '', '')).toBe(false)
    })
  })

  describe('getCustomClientId', () => {
    it('should return client_id when present and stringified', () => {
      const body = {
        meta: {
          custom_data: {
            client_id: 'client_123',
          },
        },
      }
      expect(getCustomClientId(body)).toBe('client_123')
    })

    it('should return client_id as string when it is a number', () => {
      const body = {
        meta: {
          custom_data: {
            client_id: 12345,
          },
        },
      }
      expect(getCustomClientId(body)).toBe('12345')
    })

    it('should return null when client_id or custom_data or meta is missing', () => {
      expect(getCustomClientId({})).toBeNull()
      expect(getCustomClientId({ meta: {} })).toBeNull()
      expect(getCustomClientId({ meta: { custom_data: {} } })).toBeNull()
    })
  })

  describe('getVariantId / getCustomerId / getSubscriptionId', () => {
    it('should getVariantId as string when present', () => {
      const data = {
        attributes: {
          variant_id: 9999,
        },
      }
      expect(getVariantId(data)).toBe('9999')
      expect(getVariantId({})).toBeNull()
    })

    it('should getCustomerId as string when present', () => {
      const data = {
        attributes: {
          customer_id: 8888,
        },
      }
      expect(getCustomerId(data)).toBe('8888')
      expect(getCustomerId({})).toBeNull()
    })

    it('should getSubscriptionId as string when present', () => {
      const data = {
        id: 7777,
      }
      expect(getSubscriptionId(data)).toBe('7777')
      expect(getSubscriptionId({})).toBeNull()
    })
  })
})
