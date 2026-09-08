import { describe, expect, it, vi } from 'vitest';
import { estimateInputTokens, getAIPolicy } from '@/lib/llm/policy';
import { classifyAIError } from '@/lib/llm/errors';
vi.mock('@/lib/llm/logger', () => ({ logAIProviderAttempt: vi.fn() }));
vi.mock('@/lib/llm/budget', () => ({ reserveBudget: vi.fn(async () => ({ allowed: true, enforce: false })), settleBudget: vi.fn(async () => undefined) }));
import { generateJSON } from '@/lib/llm/complete';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI reliability policy', () => {
  it('keeps feature output ceilings bounded', () => { expect(getAIPolicy('copywriter', 'chat', 99999).maxOutputTokens).toBe(1200); expect(getAIPolicy('support_chat', 'chat').timeoutMs).toBe(20000); });
  it('uses bounded embedding policy and deterministic estimation', () => { expect(getAIPolicy('support_query_embedding', 'embedding').maxAttempts).toBe(2); expect(estimateInputTokens('abc')).toBe(1); expect(estimateInputTokens('a'.repeat(10))).toBe(4); });
  it('classifies provider responses safely', () => { expect(classifyAIError(429)).toBe('provider_error'); expect(classifyAIError(501)).toBe('non_retryable_provider'); expect(classifyAIError(401)).toBe('auth_error'); expect(classifyAIError(400)).toBe('invalid_request'); });
  it('keeps SQL budget accounting cumulative and conservative', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260908064000_ai_cost_reliability.sql'), 'utf8');
    const baseline = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
    expect(migration).toContain('usage_row.estimated_cost_micros + usage_row.reserved_cost_micros');
    expect(migration).toContain('usage_row.input_tokens + usage_row.output_tokens');
    expect(migration).toContain("status='expired_charged'");
    expect(migration).toContain('DROP FUNCTION IF EXISTS settle_ai_budget_legacy');
    expect(migration).toContain('charged_input');
    for (const fn of ['reserve_ai_budget', 'settle_ai_budget', 'get_ai_cost_dashboard']) { expect(migration).toContain(`FUNCTION ${fn}`); expect(baseline).toContain(`FUNCTION public.${fn}`); }
  });
  it('repairs malformed JSON without exceeding three provider calls', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/llm/complete.ts'), 'utf8');
    expect(source).toContain('const configuredFallback = process.env.TOGETHER_FALLBACK_MODEL?.trim() || opts.model');
    expect(source).toContain('const repairModel = configuredFallback || DEFAULT_MODEL');
    expect(source).toContain('const repairPrompt = `${prompt}\\n\\nReturn ONLY valid minified JSON');
    expect(source).toContain('maxAttempts: Math.min(opts.maxAttempts ?? 2, 2)');
    expect(source).toContain('if (repairAlreadyAttempted || usedFallback) throw new AIError');
    expect(source).toContain('Return ONLY valid minified JSON');
    expect(source).toContain("throw new AIError('invalid_response', 'AI provider returned invalid JSON')");
  });
  it('caps transient JSON recovery at three fetches and does not retry auth errors', async () => {
    const originalFetch = globalThis.fetch;
    process.env.TOGETHER_API_KEY = 'test-key';
    try {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
        .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      globalThis.fetch = fetchMock as typeof fetch;
      await expect(generateJSON('return data', { context: { scope: 'internal', feature: 'founder_chat' }, maxAttempts: 2 })).rejects.toThrow('invalid JSON');
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const authFetch = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
      globalThis.fetch = authFetch as typeof fetch;
      await expect(generateJSON('return data', { context: { scope: 'internal', feature: 'founder_chat' }, maxAttempts: 2 })).rejects.toThrow('401');
      expect(authFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
