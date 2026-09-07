import { describe, expect, it } from 'vitest';
import { evaluateRules } from '@/lib/rules-engine';
import { normalizeTrackedOrigin, normalizeDestinationUrl } from '@/lib/url';
import { isSafeCssSelector } from '@/lib/css-selector';

describe('integrity v2 guards', () => {
  it('fails closed for blank and unknown conditions', () => {
    const session = { signal_type: 'google_ad', job_title: 'VP Sales' } as any;
    expect(evaluateRules(session, [{ conditions: { job_title_contains: '' }, action_type: 'inject_copy' }] as any)).toBeNull();
    expect(evaluateRules(session, [{ conditions: { unknown_key: 'x' }, action_type: 'inject_copy' }] as any)).toBeNull();
  });

  it('keeps tracked origins strict while destinations may contain paths', () => {
    expect(normalizeTrackedOrigin('https://EXAMPLE.com/')).toBe('https://example.com');
    expect(() => normalizeTrackedOrigin('https://example.com/path/')).toThrow();
    expect(normalizeDestinationUrl('https://example.com/path/?a=1#pricing')).toBe('https://example.com/path/?a=1#pricing');
    expect(() => normalizeDestinationUrl('javascript:alert(1)')).toThrow();
    expect(isSafeCssSelector('.hero h1')).toBe(true);
    expect(isSafeCssSelector('<img onerror=alert(1)>')).toBe(false);
  });
});
