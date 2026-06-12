import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClientId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('lemonsqueezy_customer_id, plan')
    .eq('id', clientId)
    .maybeSingle()

  if (!client?.lemonsqueezy_customer_id || client.plan === 'starter') {
    return NextResponse.json({ url: null })
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  if (!apiKey) {
    console.error('[Billing Portal] LEMONSQUEEZY_API_KEY not set')
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
      console.error('[Billing Portal] LS API error:', res.status, await res.text())
      return NextResponse.json({ url: null })
    }

    const data = await res.json()
    const portalUrl = data?.data?.attributes?.urls?.customer_portal ?? null
    return NextResponse.json({ url: portalUrl })
  } catch (err) {
    console.error('[Billing Portal] Exception:', err)
    return NextResponse.json({ url: null })
  }
}
