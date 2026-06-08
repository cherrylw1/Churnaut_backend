import { buildHubSpotCrmSignals } from '@/lib/scout/hubspot';
import { buildUniversalSignals } from '@/lib/scout/universal';
import { buildPriors, getScoreTrajectory } from '@/lib/scout/priors';
import type { NormalizedDeal, Priors, SignalCompleteness, Availability } from '@/lib/scout/types';

// Until CRM contacts are enriched with real emails (next phase), there is no key to join a deal
// to its website sessions, so universal signals resolve empty. Passing a non-matching sentinel
// returns a well-formed empty UniversalSignals. Once contacts carry emails, swap this for the
// deal's primary contact email and the website layer lights up automatically.
const NO_EMAIL = 'no-match@invalid.churnaut';

function priorsAvailability(p: Priors): Availability {
  const present = [p.icp, p.benchmarks, p.loss_patterns && p.loss_patterns.length].filter(Boolean).length;
  if (present === 0) return 'missing';
  if (present >= 3) return 'present';
  return 'partial';
}

export async function buildNormalizedDeals(clientId: string): Promise<NormalizedDeal[]> {
  const [crmDeals, basePriors] = await Promise.all([
    buildHubSpotCrmSignals(clientId),
    buildPriors(clientId),
  ]);

  const priorsAvail = priorsAvailability(basePriors);
  const deals: NormalizedDeal[] = [];

  for (const crm of crmDeals) {
    // Join website activity via the deal's primary contact email (empty when none available).
    const primaryEmail = crm.contacts.find((c) => c.email)?.email || NO_EMAIL;
    const universal = await buildUniversalSignals(clientId, primaryEmail);

    const completeness: SignalCompleteness = {
      crm: 'present',
      activity: crm.last_activity_at ? 'partial' : 'missing',
      contacts: crm.contacts && crm.contacts.length > 0 ? 'partial' : 'missing',
      website: universal.website.visits.length > 0 ? 'present' : 'missing',
      stage_history: crm.stage_history && crm.stage_history.length > 0 ? 'present' : 'missing',
      priors: priorsAvail,
    };

    const score_trajectory = await getScoreTrajectory(clientId, crm.deal_id);
    const priors = score_trajectory.length ? { ...basePriors, score_trajectory } : basePriors;

    deals.push({ universal, crm, priors, completeness });
  }

  return deals;
}
