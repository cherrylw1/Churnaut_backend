import { describe, expect, it } from 'vitest';
import { isSafeCssSelector, validateCssSelector } from '@/lib/css-selector';

describe('CSS selector validation', () => {
  it.each(['#hero', '.pricing .cta', '[data-churnaut="target"]', 'main > section:first-child'])('accepts %s', (selector) => {
    expect(validateCssSelector(selector)).toBe(selector);
  });

  it.each(['', '[broken', 'div::before', '<img onerror=alert(1)>'])('rejects %s', (selector) => {
    expect(isSafeCssSelector(selector)).toBe(false);
  });

  it('rejects excessive selector complexity', () => {
    expect(() => validateCssSelector(Array.from({ length: 21 }, (_, i) => `.item-${i}`).join(','))).toThrow('complex');
  });
});
