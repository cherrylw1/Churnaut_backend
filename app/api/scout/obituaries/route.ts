import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchClosedLostDeals } from '@/lib/integrations/hubspot-pipeline';
import { generateDealObituary } from '@/lib/scout-scoring';
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

    const { data: obituaries, error } = await supabaseAdmin
      .from('deal_obituaries')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Scout Obituaries GET] Error fetching obituaries:', error);
      return NextResponse.json({ error: 'Failed to fetch obituaries' }, { status: 500 });
    }

    return NextResponse.json(obituaries || []);
  } catch (err) {
    console.error('[Scout Obituaries GET] Exception:', err);
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

    // 1. Fetch existing obituary deal IDs
    const { data: existingObits, error: existingError } = await supabaseAdmin
      .from('deal_obituaries')
      .select('deal_id')
      .eq('client_id', clientId);

    if (existingError) {
      console.error('[Scout Obituaries POST] Error fetching existing obituaries:', existingError);
      return NextResponse.json({ error: 'Failed to check existing obituaries' }, { status: 500 });
    }

    const existingIds = new Set((existingObits || []).map((o) => o.deal_id));

    // 2. Fetch closed lost deals from HubSpot
    const closedLostDeals = await fetchClosedLostDeals(clientId);
    if (!closedLostDeals || closedLostDeals.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // 3. Filter for deals not yet in the table
    const newDeals = closedLostDeals.filter((deal) => !existingIds.has(deal.deal_id));

    // 4. Generate obituary for each new deal
    let generatedCount = 0;
    for (const deal of newDeals) {
      try {
        await generateDealObituary(clientId, deal);
        generatedCount++;
      } catch (genErr) {
        console.error(`[Scout Obituaries POST] Failed generating obituary for deal ${deal.deal_id}:`, genErr);
      }
    }

    return NextResponse.json({ count: generatedCount });
  } catch (err) {
    console.error('[Scout Obituaries POST] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
