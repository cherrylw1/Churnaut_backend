import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../../lib/crypto.ts'
import { Redis } from '@upstash/redis'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

const supabase = createClient(url, serviceKey)
const criticalTables: Array<[string, string]> = [
  ['clients', 'id'], ['sessions', 'id'], ['routing_rules', 'id'], ['analytics_events', 'id'],
  ['client_domains', 'id'], ['crm_tokens', 'id'], ['weekly_digests', 'id'], ['processed_webhooks', 'event_id'],
  ['webhook_mappings', 'id'], ['deal_scores', 'id'], ['pipeline_snapshots', 'id'], ['scout_nudges', 'id'],
  ['background_jobs', 'id'], ['weekly_digest_runs', 'id'],
]
const failures: string[] = []
for (const [table, key] of criticalTables) {
  const { error } = await supabase.from(table).select(key).limit(1)
  if (error) failures.push(`${table}: ${error.message}`)
}

for (const table of ['code_embeddings', 'support_embeddings']) {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (error) console.warn(`${table}: WARNING (rebuildable RAG state unavailable; customer-data restore can continue)`)
  else console.log(`${table}: PASS (rebuildable RAG state present)`)
}

const { data: tokenRow, error: tokenError } = await supabase.from('crm_tokens').select('access_token').limit(1).maybeSingle()
if (tokenError) failures.push(`crm_tokens decryption lookup: ${tokenError.message}`)
else if (tokenRow?.access_token) {
  try { decrypt(tokenRow.access_token); console.log('OAuth encryption: PASS') }
  catch { failures.push('OAuth encryption: FAIL (token could not be decrypted)') }
} else console.log('OAuth encryption: SKIPPED (no encrypted CRM token available)')

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  try { await redis.get(`dr:verify:nonexistent:${Date.now()}`); console.log('Redis connectivity: PASS') }
  catch { failures.push('Redis connectivity: FAIL') }
} else console.log('Redis connectivity: SKIPPED (credentials not supplied)')

if (process.env.DR_APP_URL) {
  const base = process.env.DR_APP_URL.replace(/\/$/, '')
  for (const route of ['/login', '/snippet.js']) {
    try { const response = await fetch(`${base}${route}`); if (!response.ok) failures.push(`${route}: HTTP ${response.status}`) }
    catch { failures.push(`${route}: request failed`) }
  }
  try {
    const response = await fetch(`${base}/dashboard`, { redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) failures.push(`/dashboard: expected redirect, got HTTP ${response.status}`)
  } catch { failures.push('/dashboard: request failed') }
}

if (failures.length) {
  console.error('DR restore verification FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else console.log('DR restore verification PASS: read-only checks completed without exposing data')
