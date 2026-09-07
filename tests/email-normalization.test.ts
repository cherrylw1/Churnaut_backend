import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '@/lib/email-normalization';

describe('email normalization', () => {
  it('uses one canonical identity for casing and whitespace variants', () => {
    expect(normalizeEmail('John@Example.com')).toBe('john@example.com');
    expect(normalizeEmail(' john@example.com ')).toBe('john@example.com');
  });

  it('returns null for optional blanks and invalid addresses', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('not an email')).toBeNull();
  });
});
