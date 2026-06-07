/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export function getVariantId(data: any): string | null {
  console.log('getVariantId data attributes:', JSON.stringify(data?.attributes, null, 2))
  const val = data?.attributes?.first_subscription_item?.variant_id?.toString() ?? null
  console.log('getVariantId resolved to:', val)
  return val
}

export function getCustomerId(data: any): string | null {
  const val = data?.attributes?.customer_id?.toString() ?? null
  console.log('getCustomerId resolved to:', val)
  return val
}

export function getSubscriptionId(data: any): string | null {
  const val = data?.id?.toString() ?? null
  console.log('getSubscriptionId resolved to:', val)
  return val
}

export function getTrialEndsAt(data: any): string | null {
  const val = data?.attributes?.trial_ends_at ?? null
  console.log('getTrialEndsAt resolved to:', val)
  return val
}

export function getStatus(data: any): string | null {
  const val = data?.attributes?.status ?? null
  console.log('getStatus resolved to:', val)
  return val
}
