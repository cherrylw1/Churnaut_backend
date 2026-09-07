function parseUrl(value: string, label: string): URL {
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error(`${label} must be a valid URL`); }
  if (parsed.username || parsed.password || !parsed.hostname) throw new Error(`${label} must contain a valid host and no credentials`);
  return parsed;
}

export function normalizeTrackedOrigin(value: string, allowLocalHttp = process.env.NODE_ENV !== 'production'): string {
  const url = parseUrl(value, 'Domain');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) throw new Error('Domain must use HTTPS');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Domain must be an origin without a path, query, or fragment');
  if (url.port && !local) throw new Error('Custom ports are only allowed for local development');
  return url.origin.toLowerCase();
}

export function normalizeDestinationUrl(value: string): string {
  const url = parseUrl(value, 'Destination URL');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Destination URL must use HTTP or HTTPS');
  return url.toString();
}

export function normalizeEmbedUrl(value: string): string {
  const url = parseUrl(value, 'Embed URL');
  if (url.protocol !== 'https:') throw new Error('Embed URL must use HTTPS');
  return url.toString();
}

export const parseHttpUrl = (value: string) => new URL(normalizeDestinationUrl(value));
export const normalizeOrigin = normalizeTrackedOrigin;
