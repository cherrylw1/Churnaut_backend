import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildICPFromWins } from '@/lib/scout-scoring';
import { getClientPlan, planGate } from '@/lib/gate';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: icpProfile, error } = await supabaseAdmin
      .from('icp_profiles')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      console.error('[Scout ICP GET] Error fetching ICP profile:', error);
      return NextResponse.json({ error: 'Failed to fetch ICP profile' }, { status: 500 });
    }

    return NextResponse.json(icpProfile || null);
  } catch (err) {
    console.error('[Scout ICP GET] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await buildICPFromWins(clientId);
    if (!result) {
      return NextResponse.json({ error: 'Failed to process ICP analysis.' }, { status: 500 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      icp_profile: result.icp_profile,
      rules_created: result.rules_created,
    });
  } catch (err) {
    console.error('[Scout ICP POST] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
