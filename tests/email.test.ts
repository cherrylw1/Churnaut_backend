import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendNudgeEmail, sendWeeklyDigest } from '@/lib/email/resend';

describe('email delivery results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key';
  });

  it('does not report success when Resend returns an application error', async () => {
    const providerError = { message: 'rate limited', name: 'rate_limit_exceeded', statusCode: 429 };
    sendMock.mockResolvedValue({ data: null, error: providerError, headers: null });

    const result = await sendNudgeEmail('rep@example.com', 'Renewal', 'Hello', 'Follow up');

    expect(result.success).toBe(false);
    expect(result.error).toEqual(providerError);
  });

  it('reports success only when Resend accepts the email', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null, headers: null });

    const result = await sendWeeklyDigest('owner@example.com', {
      summary: 'Summary',
      top_signal: 'Signal',
      rep_spotlight: 'Rep',
      recommendation: 'Recommendation',
    });

    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });
});
