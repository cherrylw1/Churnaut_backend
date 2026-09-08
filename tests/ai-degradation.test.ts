import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI gateway coverage contract', () => {
  it('keeps Together endpoints centralized and provider errors sanitized', () => {
    const root = resolve(process.cwd());
    const complete = readFileSync(resolve(root, 'lib/llm/complete.ts'), 'utf8');
    expect(complete).toContain('api.together.xyz');
    for (const file of ['app/api/chat/support/route.ts','app/api/chat/founder/route.ts','app/api/chat/codebase/route.ts']) {
      expect(readFileSync(resolve(root, file), 'utf8')).not.toContain('api.together.xyz');
    }
    expect(complete).toContain('AI_PROVIDER_DISABLED');
    expect(readFileSync(resolve(root, '.env.example'), 'utf8')).toContain('AI_BUDGET_MODE=observe');
  });
  it('keeps attribution, input limits, and degraded UI paths explicit', () => {
    const root = resolve(process.cwd());
    expect(readFileSync(resolve(root, 'lib/llm/policy.ts'), 'utf8')).toContain("scope: 'customer'; clientId: string");
    expect(readFileSync(resolve(root, 'lib/llm/complete.ts'), 'utf8')).toContain('input_budget_exceeded');
    expect(readFileSync(resolve(root, 'app/dashboard/onboarding/page.tsx'), 'utf8')).toContain('responseData.success !== false');
    expect(readFileSync(resolve(root, 'app/dashboard/rules/page.tsx'), 'utf8')).toContain('data.success !== false');
    expect(readFileSync(resolve(root, 'app/api/chat/support/route.ts'), 'utf8')).toContain('ruleCreated ?');
  });
});
