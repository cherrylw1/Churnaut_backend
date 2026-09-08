const PRODUCTION_ORIGIN = 'https://app.churnaut.com'

/**
 * Returns the origin used for server-side OAuth redirect URIs.
 * APP_ORIGIN is intentionally server-only so recovery/staging deployments can
 * use their own hostname without changing provider integration code.
 */
export function getAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim()
  const fallback = process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000'
  const value = configured || fallback
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('APP_ORIGIN must be a valid http(s) origin')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('APP_ORIGIN must be a valid http(s) origin')
  }
  return parsed.origin
}
