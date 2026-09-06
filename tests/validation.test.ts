import { describe, expect, it } from 'vitest';
import {
  authSessionRequestSchema,
  createRuleRequestSchema,
  generatedRuleSchema,
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

  it('rejects unsafe or unsupported routing actions', () => {
    const result = createRuleRequestSchema.safeParse({
      action_type: 'delete_everything',
      target_selector: '.cta',
    });
    expect(result.success).toBe(false);
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
    }).success).toBe(true);
  });
});
