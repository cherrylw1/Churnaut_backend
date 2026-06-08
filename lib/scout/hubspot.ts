import { fetchHubSpotPipeline } from '@/lib/integrations/hubspot-pipeline';
import type { CrmSignals, CanonicalStage, DealContact, Seniority } from './types';

function mapStage(raw: string): CanonicalStage {
  const s = (raw || '').toLowerCase();
  if (s === 'appointmentscheduled') return 'discovery';
  if (s === 'qualifiedtobuy') return 'qualified';
  if (s === 'presentationscheduled') return 'evaluation';
  if (s === 'decisionmakerboughtin') return 'negotiation';
  if (s === 'contractsent') return 'closing';
  if (s === 'closedwon') return 'won';
  if (s === 'closedlost') return 'lost';
  // keyword fallback for custom pipelines
  if (s.includes('closed') && s.includes('won')) return 'won';
  if (s.includes('closed') && s.includes('lost')) return 'lost';
  if (s.includes('negoti')) return 'negotiation';
  if (s.includes('contract') || s.includes('closing')) return 'closing';
  if (s.includes('proposal') || s.includes('present')) return 'proposal';
  if (s.includes('eval') || s.includes('demo')) return 'evaluation';
  if (s.includes('qualif')) return 'qualified';
  if (s.includes('discov') || s.includes('appointment') || s.includes('meeting')) return 'discovery';
  if (s.includes('lead') || s.includes('new')) return 'lead';
  return 'unknown';
}

function classifySeniority(title?: string | null): Seniority {
  if (!title) return 'unknown';
  const t = title.toLowerCase();
  if (/\b(ceo|cfo|coo|cto|cmo|cro|chief|founder|owner|president|partner)\b/.test(t)) return 'c_level';
  if (/\b(svp|evp|vp|vice president|head of)\b/.test(t)) return 'vp';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\b(manager|lead|principal)\b/.test(t)) return 'manager';
  return 'ic';
}

/**
 * HubSpot CRM adapter (#1). Reshapes the existing pipeline fetch into normalized
 * CrmSignals. Basic fields now; contact titles / activity timeline / stage history
 * are enriched in a later phase.
 */
export async function buildHubSpotCrmSignals(clientId: string): Promise<CrmSignals[]> {
  const deals = await fetchHubSpotPipeline(clientId);
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  return deals.map((d): CrmSignals => {
    const info = d.contacts_info || [];
    const contacts: DealContact[] =
      info.length > 0
        ? info.map((c) => {
            const seniority = classifySeniority(c.title);
            return {
              email: c.email ?? undefined,
              title: c.title ?? undefined,
              seniority,
              is_decision_maker: seniority === 'c_level' || seniority === 'vp' || seniority === 'director',
            };
          })
        : Array.from(
            { length: Math.max(d.contact_count, (d.contact_emails || []).length) },
            (_, i) => ({ email: (d.contact_emails || [])[i], seniority: 'unknown' as const })
          );

    const last_activity_at =
      d.last_activity_days != null
        ? new Date(now - d.last_activity_days * DAY).toISOString()
        : undefined;
    return {
      source: 'hubspot',
      deal_id: d.deal_id,
      deal_name: d.deal_name,
      owner_name: d.rep_name ?? undefined,
      owner_email: d.rep_email ?? undefined,
      value: d.deal_value,
      currency: 'USD',
      stage_raw: d.stage,
      stage_canonical: mapStage(d.stage),
      close_date: d.close_date ?? undefined,
      days_in_current_stage: d.days_in_stage,
      last_activity_at,
      days_since_last_activity: d.last_activity_days ?? undefined,
      contacts,
    };
  });
}
