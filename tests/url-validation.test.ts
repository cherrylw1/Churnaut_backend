import { describe, expect, it } from 'vitest';
import { normalizeDestinationUrl, normalizeEmbedUrl, normalizeTrackedOrigin } from '@/lib/url';

describe('URL contracts', () => {
  it('normalizes HTTPS origins and internationalized hostnames', () => {
    expect(normalizeTrackedOrigin('https://EXAMPLE.com/')).toBe('https://example.com');
    expect(normalizeTrackedOrigin('https://münich.example/')).toBe('https://xn--mnich-kva.example');
  });

  it.each(['https://user:pass@example.com', 'https://example.com/path', 'https://example.com?q=1', 'https://example.com/#x', 'http://example.com', 'https://example.com:444'])(
    'rejects unsafe tracked origin %s', (value) => expect(() => normalizeTrackedOrigin(value, false)).toThrow()
  );

  it('permits explicit local HTTP only in development', () => {
    expect(normalizeTrackedOrigin('http://localhost:3000/', true)).toBe('http://localhost:3000');
    expect(() => normalizeTrackedOrigin('http://localhost:3000/', false)).toThrow();
  });

  it('preserves destination path, query, and fragment while rejecting non-web protocols', () => {
    const destination = normalizeDestinationUrl('https://example.com/pricing?campaign=x#plans');
    const tracked = new URL(destination);
    tracked.searchParams.set('sid', 'abc123');
    expect(tracked.toString()).toBe('https://example.com/pricing?campaign=x&sid=abc123#plans');
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/a', 'mailto:a@example.com']) {
      expect(() => normalizeDestinationUrl(value)).toThrow();
    }
  });

  it('requires HTTPS for embeds', () => {
    expect(normalizeEmbedUrl('https://calendly.com/team/demo')).toBe('https://calendly.com/team/demo');
    expect(() => normalizeEmbedUrl('http://calendly.com/team/demo')).toThrow();
  });
});
