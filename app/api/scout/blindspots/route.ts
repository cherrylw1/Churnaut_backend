import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

interface ScoutDealScore {
  deal_id: string;
  deal_name: string | null;
  stage: string | null;
  deal_value: number | null;
  close_date: string | null;
  days_in_stage: number | null;
  last_activity_days: number | null;
  contact_count: number | null;
  website_visits_7d: number | null;
  score: 'RED' | 'AMBER' | 'GREEN' | null;
  primary_risk: string | null;
  next_action: string | null;
  draft_email: string | null;
}

interface BlindSpot {
  type: string;
  severity: 'critical' | 'warning';
  description: string;
}

interface RepBlindSpotReport {
  rep_name: string;
  deal_count: number;
  blind_spots: BlindSpot[];
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch all deal scores for this client
    const { data: dealScores, error: scoresError } = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    if (scoresError) {
      console.error('[Scout Blindspots GET] Error fetching deal scores:', scoresError);
      return NextResponse.json({ error: 'Database error fetching deal scores' }, { status: 500 });
    }

    if (!dealScores || dealScores.length === 0) {
      return NextResponse.json([]);
    }

    // 3. Fetch sessions to map crm_deal_id to assigned_rep (rep_name)
    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('crm_deal_id, assigned_rep')
      .eq('client_id', clientId)
      .not('crm_deal_id', 'is', null);

    if (sessionsError) {
      console.error('[Scout Blindspots GET] Error fetching sessions for rep mapping:', sessionsError);
    }

    const dealRepMap = new Map<string, string>();
    if (sessionsData) {
      for (const s of sessionsData) {
        if (s.crm_deal_id) {
          dealRepMap.set(s.crm_deal_id, s.assigned_rep || 'Unknown Rep');
        }
      }
    }

    // Group deals by rep_name
    const repDealsMap = new Map<string, ScoutDealScore[]>();
    const typedDealScores = (dealScores || []) as unknown as ScoutDealScore[];
    for (const deal of typedDealScores) {
      const repName = dealRepMap.get(deal.deal_id) || 'Unknown Rep';
      if (!repDealsMap.has(repName)) {
        repDealsMap.set(repName, []);
      }
      repDealsMap.get(repName)!.push(deal);
    }

    const reports: RepBlindSpotReport[] = [];

    // Analyze each rep's deals
    for (const [repName, deals] of Array.from(repDealsMap.entries())) {
      const blindSpots: BlindSpot[] = [];
      const dealCount = deals.length;

      // Pattern 1: Zero multithreading (all or most deals have contact_count of 0 or 1)
      const zeroMultithreadDeals = deals.filter((d) => (d.contact_count || 0) <= 1);
      if (zeroMultithreadDeals.length >= 2 && zeroMultithreadDeals.length >= dealCount / 2) {
        blindSpots.push({
          type: 'Zero Multithreading',
          severity: 'warning',
          description: `${zeroMultithreadDeals.length} deals have 1 or fewer contacts.`,
        });
      }

      // Pattern 2: Consistent inactivity (majority of deals have last_activity_days null or over 10)
      const inactiveDeals = deals.filter((d) => d.last_activity_days === null || d.last_activity_days > 10);
      if (inactiveDeals.length >= 2 && inactiveDeals.length >= dealCount / 2) {
        blindSpots.push({
          type: 'Consistent Inactivity',
          severity: 'critical',
          description: `${inactiveDeals.length} deals have no activity in over 10 days.`,
        });
      }

      // Pattern 3: Stage stagnation (multiple deals stuck in the same stage)
      const stageStagnationCount: Record<string, number> = {};
      deals.forEach((d) => {
        if (d.stage && d.days_in_stage !== null && d.days_in_stage > 30) {
          stageStagnationCount[d.stage] = (stageStagnationCount[d.stage] || 0) + 1;
        }
      });
      const stagnantStages = Object.entries(stageStagnationCount)
        .filter(([, count]) => count >= 2)
        .map(([stage]) => stage);

      if (stagnantStages.length > 0) {
        blindSpots.push({
          type: 'Stage Stagnation',
          severity: 'warning',
          description: `Multiple deals stuck in stage ${stagnantStages.join(', ')} for 30+ days.`,
        });
      }

      // Pattern 4: Close date clustering (multiple deals closing within 7 days with no activity)
      const inactiveDealsWithCloseDate = deals.filter((d) => 
        d.close_date && (d.last_activity_days === null || d.last_activity_days > 7)
      );
      const sortedDeals = [...inactiveDealsWithCloseDate].sort((a, b) => 
        new Date(a.close_date!).getTime() - new Date(b.close_date!).getTime()
      );
      
      let hasClustering = false;
      let maxClusterSize = 0;
      for (let i = 0; i < sortedDeals.length; i++) {
        const dateI = new Date(sortedDeals[i].close_date!).getTime();
        let count = 1;
        for (let j = i + 1; j < sortedDeals.length; j++) {
          const dateJ = new Date(sortedDeals[j].close_date!).getTime();
          const diffDays = (dateJ - dateI) / (1000 * 60 * 60 * 24);
          if (diffDays <= 7) {
            count++;
          } else {
            break;
          }
        }
        if (count >= 2) {
          hasClustering = true;
          maxClusterSize = Math.max(maxClusterSize, count);
        }
      }

      if (hasClustering) {
        blindSpots.push({
          type: 'Close Date Clustering',
          severity: 'critical',
          description: `${maxClusterSize} inactive deals closing within 7 days.`,
        });
      }

      // Add report if rep has deals
      reports.push({
        rep_name: repName,
        deal_count: dealCount,
        blind_spots: blindSpots,
      });
    }

    return NextResponse.json(reports);
  } catch (error) {
    console.error('[Scout Blindspots GET Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
