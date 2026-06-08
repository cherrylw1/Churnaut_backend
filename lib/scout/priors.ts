/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from '@/lib/supabase';
import type { Priors, LossPattern } from './types';

/**
 * Assemble the client's priors (winning ICP, company benchmarks, loss patterns) by READING
 * the tables that buildICPFromWins / calculateDealPatterns / generateDealObituary already
 * populate. Read-only; degrades gracefully when a client has sparse history.
 * NOTE: score_trajectory is intentionally omitted — deal_scores holds only the latest score
 * per deal, not a history; trajectory arrives with score-history retention in a later phase.
 */
export async function buildPriors(clientId: string): Promise<Priors> {
  const priors: Priors = {};

  try {
    const { data } = await supabaseAdmin
      .from('icp_profiles').select('*').eq('client_id', clientId).limit(1);
    const row = (data || [])[0] as any;
    if (row) {
      priors.icp = {
        avg_won_deal_value: typeof row.avg_deal_value === 'number' ? row.avg_deal_value : undefined,
        winning_titles: Array.isArray(row.top_job_titles) ? row.top_job_titles : undefined,
        typical_won_cycle_days: typeof row.avg_days_to_close === 'number' ? row.avg_days_to_close : undefined,
      };
    }
  } catch (e) { console.error('[buildPriors] icp_profiles read failed:', e); }

  try {
    const { data } = await supabaseAdmin
      .from('company_deal_patterns').select('*').eq('client_id', clientId).limit(1);
    const row = (data || [])[0] as any;
    if (row) {
      priors.benchmarks = {
        avg_deal_cycle_days: typeof row.avg_deal_cycle_days === 'number' ? row.avg_deal_cycle_days : undefined,
        single_contact_close_rate: typeof row.single_contact_close_rate === 'number' ? row.single_contact_close_rate : undefined,
      };
    }
  } catch (e) { console.error('[buildPriors] company_deal_patterns read failed:', e); }

  try {
    const { data } = await supabaseAdmin
      .from('deal_obituaries').select('*').eq('client_id', clientId).limit(8);
    const rows = (data || []) as any[];
    if (rows.length) {
      priors.loss_patterns = rows.map((r): LossPattern => ({
        pattern: r.pattern_match || r.likely_cause || 'unspecified loss pattern',
        likely_cause: r.likely_cause ?? undefined,
      }));
    }
  } catch (e) { console.error('[buildPriors] deal_obituaries read failed:', e); }

  return priors;
}
