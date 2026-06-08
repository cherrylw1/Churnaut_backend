import { buildNormalizedDeals } from '@/lib/scout/assemble';
import { analyzeDealWithScout } from '@/lib/scout/analyst';
import type { ScoutAnalysis, ScoutBrief, NormalizedDeal } from '@/lib/scout/types';

const SCORE_WEIGHT: Record<string, number> = { RED: 1, AMBER: 0.5, GREEN: 0 };

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function analyzeOne(deal: NormalizedDeal): Promise<ScoutBrief> {
  try {
    return await analyzeDealWithScout(deal);
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

export async function runScoutPipeline(clientId: string): Promise<ScoutAnalysis> {
  const deals = await buildNormalizedDeals(clientId);
  const briefs = await mapWithConcurrency(deals, 5, analyzeOne);
  const pipeline_pressure_score = briefs.length
    ? Math.round((briefs.reduce((s, b) => s + (SCORE_WEIGHT[b.score] ?? 0.5), 0) / briefs.length) * 100)
    : 0;
  return { pipeline_pressure_score, briefs };
}
