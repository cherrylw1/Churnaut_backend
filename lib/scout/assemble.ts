import { buildHubSpotCrmSignals } from '@/lib/scout/hubspot';
import { buildUniversalSignals } from '@/lib/scout/universal';
import { buildPriors } from '@/lib/scout/priors';
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
  const [crmDeals, priors] = await Promise.all([
    buildHubSpotCrmSignals(clientId),
    buildPriors(clientId),
  ]);

  const priorsAvail = priorsAvailability(priors);
  const deals: NormalizedDeal[] = [];

  for (const crm of crmDeals) {
    // No contact email available yet -> empty universal (see NO_EMAIL note above).
    const universal = await buildUniversalSignals(clientId, NO_EMAIL);

    const completeness: SignalCompleteness = {
      crm: 'present',
      activity: crm.last_activity_at ? 'partial' : 'missing',
      contacts: crm.contacts && crm.contacts.length > 0 ? 'partial' : 'missing',
      website: universal.website.visits.length > 0 ? 'present' : 'missing',
      stage_history: crm.stage_history && crm.stage_history.length > 0 ? 'present' : 'missing',
      priors: priorsAvail,
    };

    deals.push({ universal, crm, priors, completeness });
  }

  return deals;
}
