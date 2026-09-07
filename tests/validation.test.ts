import { describe, expect, it } from 'vitest';
import {
  authSessionRequestSchema,
  createRuleRequestSchema,
  generatedRuleSchema,
  linksRequestSchema,
  resolveRequestSchema,
  signupRequestSchema,
  webhookPayloadSchema,
} from '@/lib/validation';

describe('request validation', () => {
  it('accepts a normal public resolve payload', () => {
    const result = resolveRequestSchema.safeParse({
      client_id: 'public-client-key',
      signals: { sid: 'abc123', gclid: null },
      utms: { utm_source: 'google' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown top-level resolve fields', () => {
    const result = resolveRequestSchema.safeParse({ client_id: 'key', unexpected: 'value' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown or empty tracking signals', () => {
    expect(resolveRequestSchema.safeParse({ client_id: 'key', signals: { made_up: 'value' } }).success).toBe(false);
    expect(resolveRequestSchema.safeParse({ client_id: 'key', utms: { utm_source: '' } }).success).toBe(false);
  });

  it('rejects unsafe or unsupported routing actions', () => {
    const result = createRuleRequestSchema.safeParse({
      action_type: 'delete_everything',
      target_selector: '.cta',
    });
    expect(result.success).toBe(false);
    expect(createRuleRequestSchema.safeParse({
      action_type: 'inject_copy',
      action_payload: { swaps: [{ selector: 'div::before', content: 'Unsafe' }] },
    }).success).toBe(false);
  });

  it('requires a valid UUID for signup users', () => {
    expect(signupRequestSchema.safeParse({ userId: 'not-a-uuid', companyName: 'Acme' }).success).toBe(false);
    expect(signupRequestSchema.safeParse({ userId: '00000000-0000-0000-0000-000000000000', companyName: 'Acme' }).success).toBe(true);
  });

  it('bounds webhook payload size', () => {
    const payload = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field_${index}`, index]));
    expect(webhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('requires an access token for server sessions', () => {
    expect(authSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(authSessionRequestSchema.safeParse({ access_token: 'token' }).success).toBe(true);
  });

  it('rejects malformed AI-generated routing rules before replacement', () => {
    expect(generatedRuleSchema.safeParse({
      priority: 1,
      action_type: 'delete_everything',
    }).success).toBe(false);
    expect(generatedRuleSchema.safeParse({
      priority: 1,
      action_type: 'inject_copy',
      action_payload: { swaps: [{ selector: '#headline', content: 'Hello' }] },
    }).success).toBe(true);
  });

  it('allows HTTP destinations but requires HTTPS calendar embeds', () => {
    expect(linksRequestSchema.safeParse({ destination_url: 'http://example.com/page' }).success).toBe(true);
    expect(linksRequestSchema.safeParse({ destination_url: 'https://example.com', calendar_url: 'http://calendar.example.com' }).success).toBe(false);
    expect(linksRequestSchema.safeParse({ destination_url: 'https://example.com', calendar_url: 'https://calendar.example.com' }).success).toBe(true);
  });
});
