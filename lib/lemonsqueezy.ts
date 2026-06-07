/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

export function getVariantId(data: any): string | null {
  return data?.attributes?.variant_id?.toString() ?? null
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
