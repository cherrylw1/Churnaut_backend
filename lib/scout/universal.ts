import { supabaseAdmin } from '@/lib/supabase';
import type { UniversalSignals, WebsiteVisit, EntrySource } from './types';
import { normalizeEmail } from '@/lib/email-normalization';

export function mapEntrySource(signalType: string | null): EntrySource {
  const s = (signalType || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (['linkedin_ad','linkedin_lead_gen','google_ad','meta_ad','tiktok_ad'].includes(s)) return 'ad';
  if (['g2_referral','partner_referral'].includes(s)) return 'referral';
  if (['crm_webhook','cold_email','cold_email_link','outbound_link','webinar_attendee','qr_code'].includes(s)) return 'outreach_tool';
  if (['organic', 'organic_search'].includes(s)) return 'organic';
  return 'unknown';
}

/**
 * Build the universal (CRM-agnostic, Churnaut-native) signal layer for a prospect,
 * sourced from sessions + analytics_events. Works for any customer, any CRM or none.
 */
export async function buildUniversalSignals(
  clientId: string,
  prospectEmail: string
): Promise<UniversalSignals> {
  const email = normalizeEmail(prospectEmail);
  if (!email) throw new Error('A valid prospect email is required');

  const sessionList: any[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * 1000;
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, signal_type, prospect_name, prospect_email, company_name, job_title, click_count, converted, created_at')
      .eq('client_id', clientId)
      .eq('prospect_email', email)
      .range(from, from + 999);
    if (sessionsError) throw new Error(`Failed to load prospect sessions: ${sessionsError.message}`);
    sessionList.push(...(sessions || []));
    if (!sessions || sessions.length < 1000) break;
  }
  const sessionIds = sessionList.map((s) => s.id);
  const primary = [...sessionList].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  )[0];

  const visits: WebsiteVisit[] = [];
  let personalizationFired = false;

  if (sessionIds.length > 0) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    for (let idOffset = 0; idOffset < sessionIds.length; idOffset += 100) {
      const idChunk = sessionIds.slice(idOffset, idOffset + 100);
      for (let page = 0; page < 100; page++) {
        const from = page * 1000;
        const { data: events, error: eventsError } = await supabaseAdmin
          .from('analytics_events')
          .select('event_type, created_at, metadata')
          .eq('client_id', clientId)
          .in('session_id', idChunk)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false })
          .range(from, from + 999);
        if (eventsError) throw new Error(`Failed to load prospect events: ${eventsError.message}`);
        for (const ev of (events || []) as any[]) {
          if (ev.event_type === 'rule_triggered') personalizationFired = true;
          if (ev.event_type === 'page_view') {
            visits.push({
              occurred_at: ev.created_at,
              page: ev.metadata?.page_url || ev.metadata?.page || undefined,
            });
          }
        }
        if (!events || events.length < 1000) break;
      }
    }
  }
  visits.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

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
      clicks: sessionList.reduce((sum, session) => sum + (Number(session.click_count) || 0), 0),
      converted: sessionList.some((session) => session.converted === true),
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
