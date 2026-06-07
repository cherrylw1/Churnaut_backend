import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getVerifiedClientId } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getClientPlan(req: NextRequest): Promise<string | null> {
  const userId = await getVerifiedClientId(req)
  if (!userId) return null
  try {
    const { data } = await supabaseAdmin
      .from('clients')
      .select('plan, plan_status')
      .eq('id', userId)
      .maybeSingle()
    return data?.plan ?? 'starter'
  } catch {
    return 'starter'
  }
}

export function planGate(plan: string | null, requiredPlan: 'growth' | 'pro'): NextResponse | null {
  const hierarchy: Record<string, number> = { starter: 0, growth: 1, pro: 2 }
  const userLevel = hierarchy[plan ?? 'starter'] ?? 0
  const requiredLevel = hierarchy[requiredPlan]
  if (userLevel < requiredLevel) {
    return NextResponse.json(
      { error: 'upgrade_required', required_plan: requiredPlan },
      { status: 403 }
    )
  }
  return null
}
