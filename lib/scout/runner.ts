import { buildNormalizedDeals } from '@/lib/scout/assemble';
import { analyzeDealWithScout } from '@/lib/scout/analyst';
import type { ScoutAnalysis, ScoutBrief, NormalizedDeal } from '@/lib/scout/types';

const SCORE_WEIGHT: Record<string, number> = { RED: 1, AMBER: 0.5, GREEN: 0 };

async function analyzeOne(deal: NormalizedDeal, clientId: string): Promise<ScoutBrief> {
  try {
    return await analyzeDealWithScout(deal, clientId);
  } catch (e) {
    console.error('[runScoutPipeline] analyst failed for deal', deal.crm.deal_id, e);
    return {
      deal_id: deal.crm.deal_id,
      deal_name: deal.crm.deal_name,
      score: 'AMBER',
      confidence: 'low',
      reasoning: 'Automated analysis could not be completed for this deal; showing a neutral placeholder.',
      evidence: [],
      primary_risk: 'Analysis unavailable.',
      next_action: 'Re-run Scout, or review this deal manually.',
      data_gaps: ['scout_analysis_failed'],
    };
  }
}

/** Analyze already-assembled deals into briefs + pipeline pressure. */
export async function analyzeDeals(deals: NormalizedDeal[], clientId: string, deadlineMs?: number): Promise<ScoutAnalysis & { ai_status?: 'full' | 'partial' | 'degraded' }> {
  const briefs: ScoutBrief[] = [];
  for (let i = 0; i < deals.length; i += 5) {
    if (deadlineMs && Date.now() + 25_000 >= deadlineMs) break;
    briefs.push(...(await Promise.all(deals.slice(i, i + 5).map((deal) => analyzeOne(deal, clientId)))));
  }
  if (briefs.length < deals.length) {
    for (const deal of deals.slice(briefs.length)) briefs.push({ deal_id: deal.crm.deal_id, deal_name: deal.crm.deal_name, score: 'AMBER', confidence: 'low', reasoning: 'Automated analysis stopped before this deal was processed; showing a neutral placeholder.', evidence: [], primary_risk: 'Analysis unavailable.', next_action: 'Re-run Scout, or review this deal manually.', data_gaps: ['scout_analysis_deadline'] });
  }
  const pipeline_pressure_score = briefs.length
    ? Math.round((briefs.reduce((s, b) => s + (SCORE_WEIGHT[b.score] ?? 0.5), 0) / briefs.length) * 100)
    : 0;
  const degraded = briefs.filter((b) => b.data_gaps?.includes('scout_analysis_deadline') || b.data_gaps?.includes('scout_analysis_failed')).length;
  return { pipeline_pressure_score, briefs, ai_status: degraded === 0 ? 'full' : degraded === briefs.length ? 'degraded' : 'partial' };
}

/** Convenience: assemble the client's deals then analyze them. */
export async function runScoutPipeline(clientId: string): Promise<ScoutAnalysis> {
  const deals = await buildNormalizedDeals(clientId);
  return analyzeDeals(deals, clientId);
}
