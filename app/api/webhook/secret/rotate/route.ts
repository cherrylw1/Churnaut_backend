import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getAuthedClientId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId || clientId === 'founder') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('rotate_webhook_secret', {
    client_id_input: clientId,
    new_secret_input: crypto.randomUUID(),
  }).maybeSingle()
  if (error) {
    logError('[Webhook Secret Rotation] Failed:', error)
    return NextResponse.json({ error: 'Unable to rotate webhook secret' }, { status: 503 })
  }
  const rotated = data as { webhook_secret?: string; webhook_previous_secret_expires_at?: string }
  if (!rotated?.webhook_secret) return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
  return NextResponse.json({ webhook_secret: rotated.webhook_secret, previous_secret_expires_at: rotated.webhook_previous_secret_expires_at })
}
