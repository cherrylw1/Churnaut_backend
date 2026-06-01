import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Helper to extract authenticated client_id from cookie session
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
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch the latest snapshot for this client
    const { data: latestSnapshot, error: snapshotError } = await supabaseAdmin
      .from('pipeline_snapshots')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError) {
      console.error('[Scout Pipeline GET] Error fetching latest snapshot:', snapshotError);
      return NextResponse.json({ error: 'Database error fetching pipeline snapshot' }, { status: 500 });
    }

    // 3. Fetch deal scores for this client
    const { data: dealScores, error: scoresError } = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    if (scoresError) {
      console.error('[Scout Pipeline GET] Error fetching deal scores:', scoresError);
      return NextResponse.json({ error: 'Database error fetching deal scores' }, { status: 500 });
    }

    // 4. Sort in memory: RED first, then AMBER, then GREEN
    const scorePriority: Record<string, number> = {
      'RED': 1,
      'AMBER': 2,
      'GREEN': 3,
    };

    const sortedScores = (dealScores || []).sort((a, b) => {
      const priorityA = scorePriority[a.score as string] || 99;
      const priorityB = scorePriority[b.score as string] || 99;
      return priorityA - priorityB;
    });

    // 5. Return both deal scores and latest snapshot
    return NextResponse.json({
      pipeline_snapshot: latestSnapshot || null,
      deal_scores: sortedScores,
    });

  } catch (error) {
    console.error('[Scout Pipeline GET Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
