/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from '@/lib/supabase';
import type { UniversalSignals, WebsiteVisit, EntrySource } from './types';

function mapEntrySource(signalType: string | null): EntrySource {
  const s = (signalType || '').toLowerCase();
  if (s === 'linkedin_lead_gen') return 'ad';
  if (s === 'crm_webhook') return 'outreach_tool';
  if (!s) return 'unknown';
  return 'outreach_tool';
}

/**
 * Build the universal (CRM-agnostic, Churnaut-native) signal layer for a prospect,
 * sourced from sessions + analytics_events. Works for any customer, any CRM or none.
 */
export async function buildUniversalSignals(
  clientId: string,
  prospectEmail: string
): Promise<UniversalSignals> {
  const email = prospectEmail.trim().toLowerCase();

  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, signal_type, prospect_name, prospect_email, company_name, job_title, click_count, converted, created_at')
    .eq('client_id', clientId)
    .ilike('prospect_email', email);

  const sessionList = (sessions || []) as any[];
  const sessionIds = sessionList.map((s) => s.id);
  const primary = [...sessionList].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  )[0];

  const visits: WebsiteVisit[] = [];
  let personalizationFired = false;

  if (sessionIds.length > 0) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: events } = await supabaseAdmin
      .from('analytics_events')
      .select('event_type, created_at, metadata')
      .eq('client_id', clientId)
      .in('session_id', sessionIds)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    for (const ev of (events || []) as any[]) {
      visits.push({
        occurred_at: ev.created_at,
        page: ev.metadata?.page_url || ev.metadata?.page || undefined,
      });
      if (ev.event_type === 'rule_triggered') personalizationFired = true;
    }
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const inWindow = (ts: string, fromDaysAgo: number, toDaysAgo: number) => {
    const t = new Date(ts).getTime();
    return t >= now - fromDaysAgo * DAY && t < now - toDaysAgo * DAY;
  };
  const visits_7d = visits.filter((v) => inWindow(v.occurred_at, 7, 0)).length;
  const visits_30d = visits.length;
  const prior_7d = visits.filter((v) => inWindow(v.occurred_at, 14, 7)).length;

  let trend: 'accelerating' | 'steady' | 'cooling' | 'none';
  if (visits_7d === 0 && prior_7d === 0) trend = 'none';
  else if (visits_7d > prior_7d * 1.3) trend = 'accelerating';
  else if (visits_7d < prior_7d * 0.7) trend = 'cooling';
  else trend = 'steady';

  return {
    website: { visits, visits_7d, visits_30d, last_visit_at: visits[0]?.occurred_at, trend },
    entry_source: mapEntrySource(primary?.signal_type ?? null),
    tracked_link: {
      clicks: primary?.click_count ?? 0,
      converted: primary?.converted ?? false,
      personalization_fired: personalizationFired,
    },
    prospect: {
      name: primary?.prospect_name ?? undefined,
      email: primary?.prospect_email ?? undefined,
      company: primary?.company_name ?? undefined,
      title: primary?.job_title ?? undefined,
      source_tool: primary?.signal_type ?? undefined,
    },
  };
}
