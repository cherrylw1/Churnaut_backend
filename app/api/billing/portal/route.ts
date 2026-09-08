import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClientId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { billingMode, isStaging } from '@/lib/environment'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (isStaging() && billingMode() === 'disabled') return NextResponse.json({ url: null, disabled: true })
  const clientId = await getAuthedClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('lemonsqueezy_customer_id, plan')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError) {
    logError('[Billing Portal] Client lookup failed:', clientError)
    return NextResponse.json({ error: 'Unable to load billing account' }, { status: 500 })
  }
  if (!client) return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })

  if (!client?.lemonsqueezy_customer_id || client.plan === 'starter') {
    return NextResponse.json({ url: null })
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  if (!apiKey) {
    logError('[Billing Portal] LEMONSQUEEZY_API_KEY not set')
    return NextResponse.json({ url: null })
  }

  try {
    const res = await fetch(
      `https://api.lemonsqueezy.com/v1/customers/${client.lemonsqueezy_customer_id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/vnd.api+json',
        },
      }
    )

    if (!res.ok) {
      logError('[Billing Portal] LS API error', { status: res.status, error_category: 'provider_rejected' })
      return NextResponse.json({ url: null })
    }

    const data = await res.json()
    const portalUrl = data?.data?.attributes?.urls?.customer_portal ?? null
    return NextResponse.json({ url: portalUrl })
  } catch (err) {
    logError('[Billing Portal] Exception:', err)
    return NextResponse.json({ url: null })
  }
}
