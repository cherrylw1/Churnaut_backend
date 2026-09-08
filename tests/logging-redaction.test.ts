import { describe, expect, it } from 'vitest'
import { redactSensitive, safeErrorMessage, summarizePayload } from '@/lib/observability/redact'

describe('logging privacy controls', () => {
  it('redacts secrets, bearer tokens, email, and phone values recursively', () => {
    const result = redactSensitive({ email: 'person@example.com', authorization: 'Bearer abc', nested: [{ password: 'secret', phone: '+1 555 123 4567' }] }) as Record<string, unknown>
    expect(result.authorization).toBe('[redacted]')
    expect(result.email).toBe('p***@example.com')
    expect((result.nested as Array<Record<string, unknown>>)[0].password).toBe('[redacted]')
    expect((result.nested as Array<Record<string, unknown>>)[0].phone).toBe('[redacted]')
  })
  it('summarizes payload shape without retaining content', () => {
    expect(summarizePayload({ prompt: 'private', answer: 'private' })).toEqual({ keys: ['prompt', 'answer'], key_count: 2 })
  })
  it('redacts embedded PII, JWTs, API keys, and URL credentials', () => {
    const value = redactSensitive('failed for person@example.com phone +1 555 123 4567 token=eyJhbGciOiJIUzI1NiJ9.abc12345.def67890 https://x.test/cb?access_token=secret-value') as string
    expect(value).not.toContain('person@example.com')
    expect(value).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(value).not.toContain('secret-value')
    expect(value).toContain('[redacted]')
  })
  it('preserves safe error codes and handles Error values', () => {
    expect(redactSensitive({ error_code: 'rate_limited', statusCode: 429 })).toEqual({ error_code: 'rate_limited', statusCode: 429 })
    expect(safeErrorMessage(new Error('request for person@example.com failed'))).not.toContain('person@example.com')
  })
})
