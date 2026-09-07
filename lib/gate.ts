import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthedClientId } from '@/lib/auth'

export type ClientPlanState = 'starter' | 'growth' | 'pro' | 'missing_client' | 'plan_unavailable' | 'account_inactive' | null

export async function getClientPlan(req: NextRequest): Promise<ClientPlanState> {
  const userId = await getAuthedClientId(req)
  if (!userId) return null
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('plan, plan_status, active')
      .eq('id', userId)
      .maybeSingle()
    if (error) return 'plan_unavailable'
    if (!data) return 'missing_client'
    if (data.active === false) return 'account_inactive'
    if (data.plan === 'growth' || data.plan === 'pro') return data.plan
    return 'starter'
  } catch {
    return 'plan_unavailable'
  }
}

export function planGate(plan: ClientPlanState, requiredPlan: 'starter' | 'growth' | 'pro'): NextResponse | null {
  // Authentication is the route's first responsibility. A null plan means
  // there is no authenticated client yet; let the route return 401 instead of
  // leaking an entitlement error to anonymous callers.
  if (plan === null) return null;
  if (plan === 'missing_client') return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
  if (plan === 'plan_unavailable') return NextResponse.json({ error: 'Unable to verify account plan' }, { status: 503 })
  if (plan === 'account_inactive') return NextResponse.json({ error: 'account_disabled' }, { status: 403 })
  const hierarchy: Record<string, number> = { starter: 0, growth: 1, pro: 2 }
  const userLevel = hierarchy[plan] ?? 0
  const requiredLevel = hierarchy[requiredPlan]
  if (userLevel < requiredLevel) {
    return NextResponse.json(
      { error: 'upgrade_required', required_plan: requiredPlan },
      { status: 403 }
    )
  }
  return null;
}
