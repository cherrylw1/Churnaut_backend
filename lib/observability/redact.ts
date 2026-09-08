const SECRET_KEY = /(^|[_-])(password|passwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|webhook|signature|oauth)([_-]|$)/i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE = /(?<!\w)(?:\+?\d[\d .()\-]{7,}\d)(?!\w)/g
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const API_KEY = /\b(?:sk|pk|rk|key)[_-][A-Za-z0-9_-]{12,}\b/gi
const CREDENTIAL_URL = /([?&](?:token|access_token|refresh_token|api[_-]?key|secret|signature|code|password)=)[^&#\s]+/gi

export function redactSensitive(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 5) return '[truncated]'
  if (typeof value === 'string') {
    const result = value.replace(BEARER, '[redacted]').replace(JWT, '[redacted]').replace(API_KEY, '[redacted]')
      .replace(CREDENTIAL_URL, '$1[redacted]')
      .replace(EMAIL, (match) => `${match.slice(0, 1)}***${match.slice(match.indexOf('@'))}`)
      .replace(PHONE, '[redacted]')
    return result.length > 500 ? `${result.slice(0, 500)}…` : result
  }
  if (value instanceof Error) return { name: value.name, message: redactSensitive(value.message, depth + 1) }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitive(item, depth + 1, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    result[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSensitive(entry, depth + 1, seen)
  }
  return result
}

export function summarizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return { type: typeof value }
  const object = value as Record<string, unknown>
  return { keys: Object.keys(object).slice(0, 50), key_count: Object.keys(object).length }
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const sanitized = redactSensitive(raw)
  return String(sanitized).slice(0, 240)
}
