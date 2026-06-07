/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export function getVariantId(data: any): string | null {
  return data?.attributes?.first_subscription_item?.variant_id?.toString() ?? null
}

export function getCustomerId(data: any): string | null {
  return data?.attributes?.customer_id?.toString() ?? null
}

export function getSubscriptionId(data: any): string | null {
  return data?.id?.toString() ?? null
}

export function getTrialEndsAt(data: any): string | null {
  return data?.attributes?.trial_ends_at ?? null
}

export function getStatus(data: any): string | null {
  return data?.attributes?.status ?? null
}
