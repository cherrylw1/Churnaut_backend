import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { supabaseAdmin } from '@/lib/supabase'
import { authenticateWebhookRequest, buildWebhookSignature, isWebhookTimestampFresh } from '@/lib/webhook-auth'

const clients = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, error: null as Error | null }))

beforeEach(() => {
  clients.rows = []
  clients.error = null
  vi.mocked(supabaseAdmin.from).mockClear()
  vi.mocked(supabaseAdmin.from).mockImplementation(() => {
    let filter: { key?: string; value?: unknown } = {}
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filter = { key, value }; return builder },
      gt: () => builder,
      maybeSingle: async () => ({
        data: clients.rows.find((row) => filter.key && row[filter.key] === filter.value) ?? null,
        error: clients.error,
      }),
    }
    return builder as never
  })
})

describe('webhook authentication migration', () => {
  it('signs the exact timestamp and raw body bytes', () => {
    const signature = buildWebhookSignature('secret', '1700000000', '{"email":"a@example.com"}')
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(buildWebhookSignature('secret', '1700000000', '{}')).not.toBe(signature)
  })

  it('accepts only a five-minute timestamp window', () => {
    expect(isWebhookTimestampFresh('1700000000', 1700000000)).toBe(true)
    expect(isWebhookTimestampFresh('1699999700', 1700000000)).toBe(true)
    expect(isWebhookTimestampFresh('1699999699', 1700000000)).toBe(false)
    expect(isWebhookTimestampFresh('not-a-number', 1700000000)).toBe(false)
  })

  it('authenticates current Bearer credentials and signed requests', async () => {
    const secret = '11111111-1111-4111-8111-111111111112'
    clients.rows = [{ id: '11111111-1111-4111-8111-111111111111', webhook_secret: secret }]
    const bearer = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { Authorization: `Bearer ${secret}` } }), '{}')
    expect(bearer).toMatchObject({ ok: true, method: 'bearer' })

    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = buildWebhookSignature(secret, timestamp, '{}')
    const signed = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', {
      headers: { 'X-Churnaut-Client-Id': clients.rows[0].id as string, 'X-Churnaut-Timestamp': timestamp, 'X-Churnaut-Signature': signature },
    }), '{}')
    expect(signed).toMatchObject({ ok: true, method: 'signature' })
  })

  it('accepts a live previous credential only as a header and rejects it after grace', async () => {
    const current = '11111111-1111-4111-8111-111111111112'
    const previous = '11111111-1111-4111-8111-111111111113'
    clients.rows = [{ id: '11111111-1111-4111-8111-111111111111', webhook_secret: current, webhook_previous_secret: previous, webhook_previous_secret_expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
    const bearer = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { Authorization: `Bearer ${previous}` } }), '{}')
    expect(bearer).toMatchObject({ ok: true, method: 'bearer' })
    const query = await authenticateWebhookRequest(new Request(`https://example.com/api/webhook?client_key=${previous}`), '{}')
    expect(query).toMatchObject({ ok: false, status: 401 })
    clients.rows[0].webhook_previous_secret_expires_at = new Date(Date.now() - 1).toISOString()
    const expired = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { Authorization: `Bearer ${previous}` } }), '{}')
    expect(expired).toMatchObject({ ok: false, status: 401 })
  })

  it('accepts a previous-secret signature during grace and rejects it after grace', async () => {
    const current = '11111111-1111-4111-8111-111111111112'
    const previous = '11111111-1111-4111-8111-111111111113'
    const clientId = '11111111-1111-4111-8111-111111111111'
    clients.rows = [{ id: clientId, webhook_secret: current, webhook_previous_secret: previous, webhook_previous_secret_expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = buildWebhookSignature(previous, timestamp, '{}')
    const request = () => new Request('https://example.com/api/webhook', {
      headers: { 'X-Churnaut-Client-Id': clientId, 'X-Churnaut-Timestamp': timestamp, 'X-Churnaut-Signature': signature },
    })
    expect(await authenticateWebhookRequest(request(), '{}')).toMatchObject({ ok: true, method: 'signature' })
    clients.rows[0].webhook_previous_secret_expires_at = new Date(Date.now() - 1).toISOString()
    expect(await authenticateWebhookRequest(request(), '{}')).toMatchObject({ ok: false, status: 401 })
  })

  it('rejects tampered bodies, incomplete signatures, malformed client ids, and future timestamps', async () => {
    const secret = '11111111-1111-4111-8111-111111111112'
    const clientId = '11111111-1111-4111-8111-111111111111'
    clients.rows = [{ id: clientId, webhook_secret: secret }]
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = buildWebhookSignature(secret, timestamp, '{}')
    const base = { 'X-Churnaut-Client-Id': clientId, 'X-Churnaut-Timestamp': timestamp, 'X-Churnaut-Signature': signature }
    expect(await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: base }), '{"tampered":true}')).toMatchObject({ ok: false, status: 401 })
    expect(await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { 'X-Churnaut-Client-Id': clientId, 'X-Churnaut-Timestamp': timestamp } }), '{}')).toMatchObject({ ok: false, status: 401 })
    expect(await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { ...base, 'X-Churnaut-Client-Id': 'not-a-uuid' } }), '{}')).toMatchObject({ ok: false, status: 401 })
    const future = String(Math.floor(Date.now() / 1000) + 301)
    expect(await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { ...base, 'X-Churnaut-Timestamp': future, 'X-Churnaut-Signature': buildWebhookSignature(secret, future, '{}') } }), '{}')).toMatchObject({ ok: false, status: 401 })
  })

  it('returns 401 for malformed UUID credentials and 503 only for real database failures', async () => {
    const malformed = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', { headers: { Authorization: 'Bearer garbage' } }), '{}')
    expect(malformed).toMatchObject({ ok: false, status: 401 })
    clients.error = new Error('database unavailable')
    const failed = await authenticateWebhookRequest(new Request('https://example.com/api/webhook?client_key=11111111-1111-4111-8111-111111111112'), '{}')
    expect(failed).toMatchObject({ ok: false, status: 503 })
  })

  it('rejects malformed or stale header authentication without query downgrade', async () => {
    const secret = '11111111-1111-4111-8111-111111111112'
    clients.rows = [{ id: '11111111-1111-4111-8111-111111111111', webhook_secret: secret, webhook_query_auth_expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
    const malformed = await authenticateWebhookRequest(new Request(`https://example.com/api/webhook?client_key=${secret}`, { headers: { Authorization: 'Basic secret' } }), '{}')
    expect(malformed).toMatchObject({ ok: false, status: 401 })
    const stale = await authenticateWebhookRequest(new Request('https://example.com/api/webhook', {
      headers: { 'X-Churnaut-Client-Id': clients.rows[0].id as string, 'X-Churnaut-Timestamp': '1', 'X-Churnaut-Signature': buildWebhookSignature(secret, '1', '{}') },
    }), '{}')
    expect(stale).toMatchObject({ ok: false, status: 401 })
  })

  it('rejects malformed legacy query credentials before any database lookup', async () => {
    const malformed = await authenticateWebhookRequest(new Request('https://example.com/api/webhook?client_key=not-a-uuid'), '{}')
    expect(malformed).toMatchObject({ ok: false, status: 401 })
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })

  it('allows legacy query authentication only during the per-client window', async () => {
    const secret = '11111111-1111-4111-8111-111111111112'
    clients.rows = [{ id: '11111111-1111-4111-8111-111111111111', webhook_secret: secret, webhook_query_auth_expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
    const active = await authenticateWebhookRequest(new Request(`https://example.com/api/webhook?client_key=${secret}`), '{}')
    expect(active).toMatchObject({ ok: true, method: 'legacy_query' })
    clients.rows[0].webhook_query_auth_expires_at = null
    const expired = await authenticateWebhookRequest(new Request(`https://example.com/api/webhook?client_key=${secret}`), '{}')
    expect(expired).toMatchObject({ ok: false, status: 401 })
  })

  it('keeps URL credentials out of the dashboard and knowledge sources', () => {
    const files = [
      'app/dashboard/integrations/page.tsx',
      'app/dashboard/integrations/webhooks/page.tsx',
      'scripts/ingest-support.ts',
      'scripts/ingest-context.ts',
    ]
    for (const file of files) {
      expect(fs.readFileSync(path.join(process.cwd(), file), 'utf8')).not.toContain('?client_key=')
    }
  })

  it('does not teach support content to reconstruct secret-bearing URLs', () => {
    const support = fs.readFileSync(path.join(process.cwd(), 'scripts/ingest-support.ts'), 'utf8')
    expect(support).not.toMatch(/contains your private webhook secret/i)
    expect(support).not.toMatch(/must contain the private webhook secret/i)
    expect(support).toContain('approved relay')
    expect(support).toContain('plain /api/webhook endpoint')
  })

  it('does not allow malformed header attempts to downgrade to query auth', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'lib/webhook-auth.ts'), 'utf8')
    expect(route).toContain("if (authorization !== null)")
    expect(route).toContain('Malformed Authorization header')
    expect(route).toContain('Incomplete webhook signature headers')
    expect(route).toContain("method: 'legacy_query'")
    expect(route).toContain('webhook_query_auth_expires_at')
  })

  it('defines staged compatibility and atomic rotation in the migration', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260908062000_webhook_auth_transition.sql'), 'utf8')
    expect(migration).toContain('webhook_query_auth_expires_at')
    expect(migration).toContain("now() + interval '90 days'")
    expect(migration).toContain('clients_webhook_secret_unique')
    expect(migration).toContain('clients_webhook_previous_secret_idx')
    expect(migration).toContain('rotate_webhook_secret')
    expect(migration).toContain("webhook_query_auth_expires_at = NULL")
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret")
  })

  it('documents the reproducible signature protocol and exposes auth telemetry', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8')
    const page = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/integrations/webhooks/page.tsx'), 'utf8')
    expect(readme).toContain('X-Churnaut-Client-Id')
    expect(readme).toContain('<timestamp>.<exact request body>')
    expect(page).toContain('webhook_auth_method')
    expect(page).toContain('Legacy URL')
  })
})
