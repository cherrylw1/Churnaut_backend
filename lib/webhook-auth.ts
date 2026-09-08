import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'

export type WebhookAuthMethod = 'bearer' | 'signature' | 'legacy_query'

export type WebhookClient = {
  id: string
  domain?: string | null
  company_name?: string | null
  plan?: string | null
  webhook_secret: string
  webhook_previous_secret?: string | null
  webhook_previous_secret_expires_at?: string | null
  webhook_query_auth_expires_at?: string | null
  [key: string]: unknown
}

export type WebhookAuthResult =
  | { ok: true; client: WebhookClient; method: WebhookAuthMethod }
  | { ok: false; status: 401 | 503; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: string): boolean => UUID_PATTERN.test(value)

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function buildWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
}

export function isWebhookTimestampFresh(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parsed = Number(timestamp)
  return Number.isSafeInteger(parsed) && Math.abs(nowSeconds - parsed) <= 300
}

function previousSecretIsLive(client: WebhookClient, now = Date.now()): boolean {
  return Boolean(client.webhook_previous_secret && client.webhook_previous_secret_expires_at &&
    Date.parse(client.webhook_previous_secret_expires_at) > now)
}

async function findBySecret(secret: string): Promise<WebhookClient | null> {
  if (!isUuid(secret)) return null
  const { data, error } = await supabaseAdmin.from('clients').select('*').eq('webhook_secret', secret).maybeSingle()
  if (error) throw error
  if (data) return data as WebhookClient

  const { data: previous, error: previousError } = await supabaseAdmin
    .from('clients').select('*').eq('webhook_previous_secret', secret).gt('webhook_previous_secret_expires_at', new Date().toISOString()).maybeSingle()
  if (previousError) throw previousError
  const previousClient = previous as WebhookClient | null
  return previousClient && previousSecretIsLive(previousClient) ? previousClient : null
}

export async function authenticateWebhookRequest(req: Request, rawBody: string): Promise<WebhookAuthResult> {
  const authorization = req.headers.get('authorization')
  const signature = req.headers.get('x-churnaut-signature')
  const timestamp = req.headers.get('x-churnaut-timestamp')
  const signedClientId = req.headers.get('x-churnaut-client-id')

  try {
    if (authorization !== null) {
      const match = authorization.match(/^Bearer\s+(.+)$/i)
      if (!match || !match[1].trim()) return { ok: false, status: 401, error: 'Malformed Authorization header' }
      const client = await findBySecret(match[1].trim())
      if (!client) return { ok: false, status: 401, error: 'Unauthorized webhook credential' }
      return { ok: true, client, method: client.webhook_secret === match[1].trim() ? 'bearer' : 'bearer' }
    }

    const anySignatureHeader = signature !== null || timestamp !== null || signedClientId !== null
    if (anySignatureHeader) {
      if (!signature || !timestamp || !signedClientId || !isUuid(signedClientId)) {
        return { ok: false, status: 401, error: 'Incomplete webhook signature headers' }
      }
      if (!isWebhookTimestampFresh(timestamp)) {
        return { ok: false, status: 401, error: 'Webhook signature timestamp is outside the allowed window' }
      }
      if (!/^v1=[0-9a-f]{64}$/i.test(signature)) return { ok: false, status: 401, error: 'Malformed webhook signature' }

      const { data: client, error } = await supabaseAdmin.from('clients').select('*').eq('id', signedClientId).maybeSingle()
      if (error) throw error
      if (!client) return { ok: false, status: 401, error: 'Unauthorized webhook client' }

      const candidate = signature.slice(3).toLowerCase()
      const currentDigest = buildWebhookSignature(String(client.webhook_secret), timestamp, rawBody).slice(3)
      const previousDigest = previousSecretIsLive(client as WebhookClient)
        ? buildWebhookSignature(String(client.webhook_previous_secret), timestamp, rawBody).slice(3)
        : null
      if (!safeEqual(candidate, currentDigest) && (!previousDigest || !safeEqual(candidate, previousDigest))) {
        return { ok: false, status: 401, error: 'Invalid webhook signature' }
      }
      return { ok: true, client: client as WebhookClient, method: 'signature' }
    }

    const querySecret = new URL(req.url).searchParams.get('client_key')
    if (!querySecret) return { ok: false, status: 401, error: 'Missing webhook authorization' }
    const client = await findBySecret(querySecret)
    if (!client || !client.webhook_query_auth_expires_at || Date.parse(client.webhook_query_auth_expires_at) <= Date.now() || client.webhook_secret !== querySecret) {
      return { ok: false, status: 401, error: 'Legacy URL authentication has expired; use the Authorization header' }
    }
    return { ok: true, client, method: 'legacy_query' }
  } catch (error) {
    console.error('[Webhook Auth Error] Client lookup failed:', error)
    return { ok: false, status: 503, error: 'Webhook authentication service unavailable' }
  }
}
