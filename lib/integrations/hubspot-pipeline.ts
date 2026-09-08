import { logError, logWarn, logInfo } from '../observability/logger';
import { recordOpsEvent } from '../monitoring/events';
import { stagingIntegrationsEnabled } from '../environment';
import { supabaseAdmin } from '@/lib/supabase';
import { decrypt, encrypt } from '@/lib/crypto';
import { redis } from '@/lib/redis';
import { getAppOrigin } from '@/lib/app-origin';

export interface ScoutDeal {
  deal_id: string;
  deal_name: string;
  stage: string;
  deal_value: number;
  close_date: string | null;
  days_in_stage: number | null;
  stage_entered_at: string | null;
  last_activity_days: number | null;
  contact_count: number;
  contact_emails: string[];
  contacts_info: { email: string | null; title: string | null }[];
  website_visits_7d: number;
  rep_name: string | null;
  rep_email: string | null;
}

interface ActivityProperties {
  notes_last_contacted?: string;
  hs_last_booked_meeting_date?: string;
  hs_last_sales_activity_timestamp?: string;
  hs_last_activity_date?: string;
}

type HubSpotSearchResult = { id: string; properties: Record<string, string | undefined> };

export function daysSince(timestamp: string | null | undefined, now = Date.now()): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / 86_400_000));
}

export async function searchHubSpotDeals(accessToken: string, filterGroups: unknown[], properties: string[]): Promise<HubSpotSearchResult[]> {
  const results = new Map<string, HubSpotSearchResult>();
  const seenCursors = new Set<number>();
  let after: number | undefined;
  const maxPages = 100;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups, properties, limit: 100, ...(after === undefined ? {} : { after }) }),
      });
      if (response.status !== 429) break;
      const waitSeconds = Math.min(5, Math.max(0, Number(response.headers.get('Retry-After') || 1)));
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
    if (!response) throw new Error('HubSpot search produced no response');
    if (!response.ok) throw new Error(`Failed to fetch deals from HubSpot: ${response.statusText}`);
    const page = await response.json();
    for (const deal of page.results || []) if (deal?.id) results.set(deal.id, deal);
    const next = page.paging?.next?.after;
    if (next === undefined) return [...results.values()];
    const nextCursor = Number(next);
    if (!Number.isFinite(nextCursor) || seenCursors.has(nextCursor)) throw new Error('HubSpot returned a repeated or invalid pagination cursor');
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
  throw new Error(`HubSpot search exceeded the ${maxPages}-page safety limit`);
}

export async function fetchStageEntryDates(
  accessToken: string,
  deals: Array<{ id: string; currentStage: string | null | undefined }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const currentStageById = new Map(deals.map((deal) => [deal.id, deal.currentStage]));
  const dealIds = deals.map((deal) => deal.id);
  for (let i = 0; i < dealIds.length; i += 100) {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: dealIds.slice(i, i + 100).map((id) => ({ id })), propertiesWithHistory: ['dealstage'] }),
    });
    if (!response.ok) continue;
    const body = await response.json();
    for (const deal of body.results || []) {
      const history = deal.propertiesWithHistory?.dealstage || [];
      const currentStage = currentStageById.get(deal.id);
      const latest = history
        .filter((entry: { value?: string }) => !!currentStage && entry.value === currentStage)
        .map((entry: { timestamp?: string }) => entry.timestamp)
        .filter((timestamp: unknown): timestamp is string => typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)))
        .sort()
        .at(-1);
      if (latest) result.set(deal.id, latest);
    }
  }
  return result;
}

/**
 * Fetches HubSpot pipeline data for a given client, enriches it with contact info
 * and recent website visits, and returns a sanitized list of open deals.
 * Caches results in Upstash Redis for 30 minutes.
 */
export async function getValidHubSpotToken(clientId: string): Promise<string | null> {
  if (!stagingIntegrationsEnabled()) return null;
  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token, refresh_token, expires_at, connection_status')
    .eq('client_id', clientId)
    .eq('crm_type', 'hubspot')
    .order('updated_at', { ascending: false });

  if (tokenError) {
    logError('[HubSpot Token] Error fetching token from crm_tokens:', tokenError);
  }

  const tokenData = tokens && tokens.length > 0 ? tokens[0] : null;
  if (!tokenData) {
    logWarn(`[HubSpot Token] No HubSpot OAuth connection found for client ${clientId}`);
    return null;
  }
  if (tokenData.connection_status === 'unhealthy') return null;

  let accessToken = decrypt(tokenData.access_token);
  if (!accessToken) {
    logError('[HubSpot Token] Failed to decrypt access token');
    return null;
  }

  const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
  const isExpired = expiresAt === 0 || expiresAt - Date.now() < 5 * 60 * 1000;

  if (isExpired && tokenData.refresh_token) {
    logInfo('[HubSpot Token] Access token expired or expiring soon. Refreshing...');
    try {
      const decryptedRefreshToken = decrypt(tokenData.refresh_token);
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', process.env.HUBSPOT_CLIENT_ID || '');
      params.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET || '');
      params.append('redirect_uri', `${getAppOrigin()}/api/oauth/hubspot/callback`);
      params.append('refresh_token', decryptedRefreshToken);

      const refreshRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!refreshRes.ok) {
        logError('[HubSpot Token] Refresh failed with status:', refreshRes.status);
        await supabaseAdmin.from('crm_tokens').update({ connection_status: 'unhealthy', last_error: `refresh_http_${refreshRes.status}`, updated_at: new Date().toISOString() }).eq('client_id', clientId).eq('crm_type', 'hubspot');
        await recordOpsEvent({ component: 'crm', eventCode: 'crm_unhealthy', severity: 'error', clientId, metadata: { crm_type: 'hubspot', failure_category: 'refresh_http' } });
        return null;
      }

      const refreshData = await refreshRes.json();
      const newAccessToken = refreshData.access_token;
      if (!refreshData.access_token || !Number.isFinite(Number(refreshData.expires_in))) {
        logError('[HubSpot Token] Refresh response is missing required fields');
        await supabaseAdmin.from('crm_tokens').update({ connection_status: 'unhealthy', last_error: 'refresh_invalid_response', updated_at: new Date().toISOString() }).eq('client_id', clientId).eq('crm_type', 'hubspot');
        await recordOpsEvent({ component: 'crm', eventCode: 'crm_unhealthy', severity: 'error', clientId, metadata: { crm_type: 'hubspot', failure_category: 'refresh_invalid_response' } });
        return null;
      }
      const newRefreshToken = refreshData.refresh_token || decryptedRefreshToken;
      const newExpiresAt = new Date(Date.now() + Number(refreshData.expires_in) * 1000).toISOString();
      const encryptedAccess = encrypt(newAccessToken);
      const encryptedRefresh = encrypt(newRefreshToken);

      const { error: updateError } = await supabaseAdmin
        .from('crm_tokens')
        .update({
          access_token: encryptedAccess,
          refresh_token: encryptedRefresh,
          expires_at: newExpiresAt,
          connection_status: 'healthy',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .eq('crm_type', 'hubspot');

      if (updateError) {
        logError('[HubSpot Token] Failed to update refreshed tokens:', updateError.message);
        return null;
      } else {
        logInfo('[HubSpot Token] Refreshed and updated successfully.');
        accessToken = newAccessToken;
      }
    } catch (refreshErr) {
      logError('[HubSpot Token] Exception during refresh:', refreshErr);
      await supabaseAdmin.from('crm_tokens').update({ connection_status: 'unhealthy', last_error: 'refresh_exception', updated_at: new Date().toISOString() }).eq('client_id', clientId).eq('crm_type', 'hubspot');
      await recordOpsEvent({ component: 'crm', eventCode: 'crm_unhealthy', severity: 'error', clientId, metadata: { crm_type: 'hubspot', failure_category: 'refresh_exception' } });
      return null;
    }
  }

  return accessToken;
}

export async function fetchHubSpotPipeline(clientId: string, bypassCache = false): Promise<ScoutDeal[]> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }
  if (!stagingIntegrationsEnabled()) return [];

  const cacheKey = `scout:pipeline:${clientId}`;

  // 1. Try Cache Read
  if (!bypassCache) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : (cached as ScoutDeal[]);
      }
    } catch (cacheErr) {
      logError('[Scout Pipeline Cache Read Error] Failed to read from Redis:', cacheErr);
    }
  }

  // 2. Get valid HubSpot access token (handles lookup, decrypt, refresh)
  const accessToken = await getValidHubSpotToken(clientId);
  if (!accessToken) throw new Error('HubSpot connection is unavailable');

  // 4. Fetch open deals from HubSpot CRM
  const searchUrl = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  logInfo('[HubSpot Pipeline debug] Fetching open deals from Search URL:', searchUrl);
  const rawDeals = await searchHubSpotDeals(accessToken, [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' }
          ]
        }
      ], [
        'dealname',
        'dealstage',
        'amount',
        'closedate',
        'createdate',
        'hs_lastmodifieddate',
        'hubspot_owner_id',
        'hs_last_activity_date',
        'notes_last_contacted',
        'hs_last_booked_meeting_date',
        'hs_last_sales_activity_timestamp'
        ,'hs_v2_date_entered_current_stage'
      ]);

interface HubSpotDealResult {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    amount?: string;
    closedate?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
    hubspot_owner_id?: string;
    hs_last_activity_date?: string;
    notes_last_contacted?: string;
    hs_last_booked_meeting_date?: string;
    hs_last_sales_activity_timestamp?: string;
    hs_v2_date_entered_current_stage?: string;
  };
}

  // Log how many deals are returned and what their stages are after the fix
  const dealStages = (rawDeals as HubSpotDealResult[]).map((d) => d.properties?.dealstage || 'unknown');
  logInfo(`[HubSpot Pipeline] Returned ${rawDeals.length} deals with stages:`, dealStages);
  const stageEntryDates = await fetchStageEntryDates(accessToken, (rawDeals as HubSpotDealResult[]).map((deal) => ({
    id: deal.id,
    currentStage: deal.properties?.dealstage,
  })));

  // Fetch unique owner details from HubSpot Owners API
  const uniqueOwnerIds = Array.from(
    new Set(
      (rawDeals as HubSpotDealResult[])
        .map((d) => d.properties?.hubspot_owner_id)
        .filter((id): id is string => !!id)
    )
  );

  const ownerMap = new Map<string, { email: string; name: string }>();

  for (let ownerOffset = 0; ownerOffset < uniqueOwnerIds.length; ownerOffset += 10) {
    await Promise.all(uniqueOwnerIds.slice(ownerOffset, ownerOffset + 10).map(async (ownerId) => {
        try {
          const ownerRes = await fetch(`https://api.hubapi.com/crm/v3/owners/${ownerId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (ownerRes.ok) {
            const ownerData = await ownerRes.json();
            const email = ownerData.email || '';
            const firstName = ownerData.firstName || '';
            const lastName = ownerData.lastName || '';
            const name = `${firstName} ${lastName}`.trim() || 'Unknown Rep';
            ownerMap.set(ownerId, { email, name });
          } else {
            logWarn(`[HubSpot Pipeline Warning] Failed to fetch owner details for ID: ${ownerId}. Status: ${ownerRes.status}`);
          }
        } catch (err) {
          logError(`[HubSpot Pipeline Error] Failed to fetch owner details for ID: ${ownerId}:`, err);
        }
      }));
  }

  // 5. Batch-fetch all deal→contact associations in one API call (replaces N+1 per-deal fetches)
  // Activity properties are already present in rawDeals from the search request (Step 1 above)
  const dealIds = (rawDeals as HubSpotDealResult[]).map(d => d.id);
  const dealContactMap = new Map<string, string[]>();

  if (dealIds.length > 0) {
    // HubSpot batch associations: up to 100 inputs per call
    const batchSize = 100;
    for (let i = 0; i < dealIds.length; i += batchSize) {
      const chunk = dealIds.slice(i, i + batchSize);
      let retries = 0;
      while (retries < 3) {
        try {
          const assocRes = await fetch('https://api.hubapi.com/crm/v3/associations/deals/contacts/batch/read', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: chunk.map(id => ({ from: { id } })) }),
          });

          if (assocRes.status === 429) {
            const parsedRetryAfter = Number(assocRes.headers.get('Retry-After') || 1);
            const retryAfter = Math.min(5, Math.max(0, Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : 1));
            logWarn(`[Scout Pipeline] 429 on batch associations — waiting ${retryAfter}s`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            retries++;
            continue;
          }

          if (assocRes.ok) {
            const assocData = await assocRes.json();
            for (const result of assocData.results || []) {
              const fromId: string = result.from?.id;
              const toIds: string[] = (result.to || []).map((t: { id: string }) => t.id);
              if (fromId) dealContactMap.set(fromId, toIds);
            }
          } else {
            logWarn(`[Scout Pipeline] Batch associations failed: ${assocRes.status}`);
          }
          break;
        } catch (err) {
          logError('[Scout Pipeline] Batch associations error:', err);
          break;
        }
      }
    }
  }

  const detailedDeals = (rawDeals as HubSpotDealResult[]).map(deal => ({
    deal,
    contactIds: dealContactMap.get(deal.id) || [],
    // Activity properties now come from the search result — no extra fetch needed
    activityProperties: {
      notes_last_contacted: deal.properties.notes_last_contacted,
      hs_last_booked_meeting_date: deal.properties.hs_last_booked_meeting_date,
      hs_last_sales_activity_timestamp: deal.properties.hs_last_sales_activity_timestamp,
      hs_last_activity_date: deal.properties.hs_last_activity_date,
    } as ActivityProperties,
  }));

  // 6. Gather all unique contact IDs and batch read their emails
  const allContactIds = Array.from(new Set(detailedDeals.flatMap((d) => d.contactIds)));
  const contactIdToEmail = new Map<string, string>();
  const contactIdToTitle = new Map<string, string>();

  if (allContactIds.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < allContactIds.length; i += chunkSize) {
      const chunk = allContactIds.slice(i, i + chunkSize);
      try {
        const batchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: ['email', 'jobtitle'],
            inputs: chunk.map((id) => ({ id })),
          }),
        });

        if (batchRes.ok) {
          const batchData = await batchRes.json();
          for (const result of batchData.results || []) {
            const email = result.properties?.email;
            if (email) {
              contactIdToEmail.set(result.id, email.toLowerCase().trim());
            }
            const jobtitle = result.properties?.jobtitle;
            if (jobtitle) {
              contactIdToTitle.set(result.id, String(jobtitle).trim());
            }
          }
        }
      } catch (err) {
        logError('[Scout Pipeline Error] Contact batch fetch failed:', err);
      }
    }
  }

  // Map contact IDs to emails for each deal
  const dealsWithEmails = detailedDeals.map((d) => {
    const emails = Array.from(new Set(d.contactIds
      .map((id) => contactIdToEmail.get(id))
      .filter((email): email is string => !!email)));
    const contactsInfo = d.contactIds.map((id) => ({
      email: contactIdToEmail.get(id) || null,
      title: contactIdToTitle.get(id) || null,
    }));
    return {
      ...d,
      emails,
      contactsInfo,
    };
  });

  // 7. Count website visits in the last 7 days via sessions table
  const allEmails = Array.from(new Set(dealsWithEmails.flatMap((d) => d.emails)));
  const emailToSessionIds = new Map<string, string[]>();
  const allSessionIds: string[] = [];

  if (allEmails.length > 0) {
    for (let emailOffset = 0; emailOffset < allEmails.length; emailOffset += 100) {
      const emailChunk = allEmails.slice(emailOffset, emailOffset + 100);
      for (let page = 0; page < 100; page++) {
        const from = page * 1000;
        const { data: sessions, error: sessionsErr } = await supabaseAdmin
          .from('sessions')
          .select('id, prospect_email')
          .eq('client_id', clientId)
          .in('prospect_email', emailChunk)
          .range(from, from + 999);

        if (sessionsErr) {
          logError('[Scout Pipeline DB Error] Failed fetching sessions:', sessionsErr);
          break;
        }
        for (const session of sessions || []) {
          if (session.prospect_email) {
            const email = session.prospect_email.toLowerCase().trim();
            const list = emailToSessionIds.get(email) || [];
            list.push(session.id);
            emailToSessionIds.set(email, list);
            allSessionIds.push(session.id);
          }
        }
        if (!sessions || sessions.length < 1000) break;
      }
    }
  }

  // Count events in analytics_events for found session IDs
  const sessionToEventCount = new Map<string, number>();
  if (allSessionIds.length > 0) {
    const uniqueSessionIds = Array.from(new Set(allSessionIds));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const chunkSize = 100;
    for (let i = 0; i < uniqueSessionIds.length; i += chunkSize) {
      const chunk = uniqueSessionIds.slice(i, i + chunkSize);
      for (let page = 0; page < 100; page++) {
        const from = page * 1000;
        const { data: events, error: eventsErr } = await supabaseAdmin
          .from('analytics_events')
          .select('session_id')
          .eq('client_id', clientId)
          .in('session_id', chunk)
          .eq('event_type', 'page_view')
          .gte('created_at', sevenDaysAgo.toISOString())
          .range(from, from + 999);

        if (eventsErr) {
          logError('[Scout Pipeline DB Error] Failed fetching analytics events:', eventsErr);
          break;
        }
        for (const ev of events || []) {
          if (ev.session_id) {
            sessionToEventCount.set(ev.session_id, (sessionToEventCount.get(ev.session_id) || 0) + 1);
          }
        }
        if (!events || events.length < 1000) break;
      }
    }
  }

  // 8. Compile the final list of ScoutDeals
  const scoredDeals: ScoutDeal[] = dealsWithEmails.map((item) => {
    let website_visits_7d = 0;
    for (const email of item.emails) {
      const sessionIds = emailToSessionIds.get(email) || [];
      for (const sid of sessionIds) {
        website_visits_7d += sessionToEventCount.get(sid) || 0;
      }
    }

    const dealProps = item.deal.properties || {};
    const stageEnteredAt = stageEntryDates.get(item.deal.id) || dealProps.hs_v2_date_entered_current_stage;
    const hs_last_sales_activity_timestamp = item.activityProperties.hs_last_sales_activity_timestamp;

    // Calculate days_in_stage
    const days_in_stage = daysSince(stageEnteredAt);

    // Calculate last_activity_days
    let last_activity_days: number | null = null;
    let lastActivityTimestamp = item.activityProperties.hs_last_activity_date || dealProps.hs_last_activity_date || hs_last_sales_activity_timestamp;

    // Fallbacks
    if (!lastActivityTimestamp && item.activityProperties.notes_last_contacted) {
      lastActivityTimestamp = item.activityProperties.notes_last_contacted;
    }
    if (!lastActivityTimestamp && item.activityProperties.hs_last_booked_meeting_date) {
      lastActivityTimestamp = item.activityProperties.hs_last_booked_meeting_date;
    }

    if (lastActivityTimestamp) last_activity_days = daysSince(lastActivityTimestamp);

    const ownerId = dealProps.hubspot_owner_id;
    const ownerInfo = ownerId ? ownerMap.get(ownerId) : null;
    const rep_name = ownerInfo?.name || null;
    const rep_email = ownerInfo?.email || null;

    return {
      deal_id: item.deal.id,
      deal_name: dealProps.dealname || 'Unnamed Deal',
      stage: dealProps.dealstage || 'Unknown Stage',
      deal_value: dealProps.amount ? parseFloat(dealProps.amount) : 0,
      close_date: dealProps.closedate || null,
      days_in_stage,
      stage_entered_at: stageEnteredAt || null,
      last_activity_days,
      contact_count: item.contactIds.length,
      contact_emails: item.emails,
      contacts_info: item.contactsInfo,
      website_visits_7d,
      rep_name,
      rep_email,
    };
  });

  // 9. Cache in Redis
  try {
    await redis.set(cacheKey, JSON.stringify(scoredDeals), { ex: 60 });
  } catch (cacheErr) {
    logError('[Scout Pipeline Cache Write Error] Failed to write to Redis:', cacheErr);
  }

  return scoredDeals;
}

export interface ScoutClosedLostDeal {
  deal_id: string;
  deal_name: string;
  stage: string;
  deal_value: number;
  close_date: string | null;
  days_in_stage: number | null;
  last_activity_days: number | null;
  contact_count: number;
}

export async function fetchClosedLostDeals(clientId: string): Promise<ScoutClosedLostDeal[]> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  // 1. Get valid HubSpot access token (handles lookup, decrypt, refresh)
  const accessToken = await getValidHubSpotToken(clientId);
  if (!accessToken) throw new Error('HubSpot connection is unavailable');

  // 3. Search closed lost deals from HubSpot CRM
  const rawDeals = await searchHubSpotDeals(accessToken, [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }] }], ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_last_activity_date', 'notes_last_contacted', 'hs_last_booked_meeting_date', 'hs_last_sales_activity_timestamp', 'hs_v2_date_entered_current_stage']);

  interface HubSpotDealResult {
    id: string;
    properties: {
      dealname?: string;
      dealstage?: string;
      amount?: string;
      closedate?: string;
      createdate?: string;
      hs_lastmodifieddate?: string;
      hubspot_owner_id?: string;
      hs_last_activity_date?: string;
      notes_last_contacted?: string;
      hs_last_booked_meeting_date?: string;
      hs_last_sales_activity_timestamp?: string;
      hs_v2_date_entered_current_stage?: string;
    };
  }

  // 4. Batch-fetch all deal→contact associations (replaces N+1 per-deal fetches)
  // Activity properties are already in rawDeals from the search request above
  const closedLostDealIds = (rawDeals as HubSpotDealResult[]).map(d => d.id);
  const closedLostStageEntryDates = await fetchStageEntryDates(accessToken, (rawDeals as HubSpotDealResult[]).map((deal) => ({
    id: deal.id,
    currentStage: deal.properties?.dealstage,
  })));
  const closedLostContactMap = new Map<string, string[]>();
  if (closedLostDealIds.length > 0) {
    for (let offset = 0; offset < closedLostDealIds.length; offset += 100) try {
      const chunk = closedLostDealIds.slice(offset, offset + 100);
      const assocRes = await fetch('https://api.hubapi.com/crm/v3/associations/deals/contacts/batch/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: chunk.map(id => ({ from: { id } })) }),
      });
      if (assocRes.ok) {
        const assocData = await assocRes.json();
        for (const result of assocData.results || []) {
          const fromId: string = result.from?.id;
          const toIds: string[] = (result.to || []).map((t: { id: string }) => t.id);
          if (fromId) closedLostContactMap.set(fromId, toIds);
        }
      }
    } catch (err) {
      logError('[Scout Closed Lost] Batch associations error:', err);
    }
  }

  const closedLostDeals: ScoutClosedLostDeal[] = (rawDeals as HubSpotDealResult[]).map((deal) => {
      const contactIds = closedLostContactMap.get(deal.id) || [];
      const activityProperties: ActivityProperties = {
        notes_last_contacted: deal.properties.notes_last_contacted,
        hs_last_booked_meeting_date: deal.properties.hs_last_booked_meeting_date,
        hs_last_sales_activity_timestamp: deal.properties.hs_last_sales_activity_timestamp,
        hs_last_activity_date: deal.properties.hs_last_activity_date,
      };

      const dealProps = deal.properties || {};
      const stageEnteredAt = closedLostStageEntryDates.get(deal.id) || dealProps.hs_v2_date_entered_current_stage;
      const hs_last_sales_activity_timestamp = activityProperties.hs_last_sales_activity_timestamp;

      // Calculate days_in_stage (or final stage duration)
      const days_in_stage = daysSince(stageEnteredAt);

      // Calculate last_activity_days
      let last_activity_days: number | null = null;
      let lastActivityTimestamp = activityProperties.hs_last_activity_date || dealProps.hs_last_activity_date || hs_last_sales_activity_timestamp;

      if (!lastActivityTimestamp && activityProperties.notes_last_contacted) {
        lastActivityTimestamp = activityProperties.notes_last_contacted;
      }
      if (!lastActivityTimestamp && activityProperties.hs_last_booked_meeting_date) {
        lastActivityTimestamp = activityProperties.hs_last_booked_meeting_date;
      }

      if (lastActivityTimestamp) last_activity_days = daysSince(lastActivityTimestamp);

      return {
        deal_id: deal.id,
        deal_name: dealProps.dealname || 'Unnamed Deal',
        stage: dealProps.dealstage || 'closedlost',
        deal_value: dealProps.amount ? parseFloat(dealProps.amount) : 0,
        close_date: dealProps.closedate || null,
        days_in_stage,
        last_activity_days,
        contact_count: contactIds.length,
      };
    });

  return closedLostDeals;
}

export interface ScoutClosedWonDeal {
  deal_id: string;
  deal_name: string;
  deal_value: number;
  days_to_close: number;
  contact_job_titles: string[];
  stage_sequence: string[];
}

export async function fetchClosedWonDeals(clientId: string): Promise<ScoutClosedWonDeal[]> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  // 1. Get valid HubSpot access token (handles lookup, decrypt, refresh)
  const accessToken = await getValidHubSpotToken(clientId);
  if (!accessToken) throw new Error('HubSpot connection is unavailable');

  // 3. Search closedwon deals from HubSpot CRM
  const rawDeals = await searchHubSpotDeals(accessToken, [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }], ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_last_activity_date', 'notes_last_contacted', 'hs_last_booked_meeting_date', 'hs_last_sales_activity_timestamp', 'hs_v2_date_entered_current_stage']);

  interface HubSpotDealResult {
    id: string;
    properties: {
      dealname?: string;
      dealstage?: string;
      amount?: string;
      closedate?: string;
      createdate?: string;
      hs_lastmodifieddate?: string;
      hubspot_owner_id?: string;
      hs_last_activity_date?: string;
      notes_last_contacted?: string;
      hs_last_booked_meeting_date?: string;
      hs_last_sales_activity_timestamp?: string;
    };
  }

  // 4. Batch-fetch all deal→contact associations (replaces N+1 per-deal fetches)
  const closedWonDealIds = (rawDeals as HubSpotDealResult[]).map(d => d.id);
  const closedWonContactMap = new Map<string, string[]>();
  if (closedWonDealIds.length > 0) {
    for (let offset = 0; offset < closedWonDealIds.length; offset += 100) try {
      const chunk = closedWonDealIds.slice(offset, offset + 100);
      const assocRes = await fetch('https://api.hubapi.com/crm/v3/associations/deals/contacts/batch/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: chunk.map(id => ({ from: { id } })) }),
      });
      if (assocRes.ok) {
        const assocData = await assocRes.json();
        for (const result of assocData.results || []) {
          const fromId: string = result.from?.id;
          const toIds: string[] = (result.to || []).map((t: { id: string }) => t.id);
          if (fromId) closedWonContactMap.set(fromId, toIds);
        }
      }
    } catch (err) {
      logError('[Scout Closed Won] Batch associations error:', err);
    }
  }

  const detailedDeals = (rawDeals as HubSpotDealResult[]).map((deal) => {
    const contactIds = closedWonContactMap.get(deal.id) || [];
    return {
      deal,
      contactIds,
    };
  });

  // 5. Fetch all unique contacts' job titles
  const allContactIds = Array.from(new Set(detailedDeals.flatMap((d) => d.contactIds)));
  const contactIdToJobTitle = new Map<string, string>();

  if (allContactIds.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < allContactIds.length; i += chunkSize) {
      const chunk = allContactIds.slice(i, i + chunkSize);
      try {
        const batchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: ['jobtitle'],
            inputs: chunk.map((id) => ({ id })),
          }),
        });

        if (batchRes.ok) {
          const batchData = await batchRes.json();
          for (const result of batchData.results || []) {
            const title = result.properties?.jobtitle;
            if (title) {
              contactIdToJobTitle.set(result.id, title.trim());
            }
          }
        }
      } catch (err) {
        logError('[Scout Closed Won Error] Contact batch fetch failed:', err);
      }
    }
  }

  // 6. Compile the final list of closed-won deals
  return detailedDeals.map((item) => {
    const dealProps = item.deal.properties || {};
    const createdate = dealProps.createdate;
    const closedate = dealProps.closedate;

    let days_to_close = 0;
    if (createdate && closedate) {
      const diffMs = new Date(closedate).getTime() - new Date(createdate).getTime();
      days_to_close = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    const contact_job_titles = item.contactIds
      .map((id) => contactIdToJobTitle.get(id))
      .filter((title): title is string => !!title);

    const stage_sequence = dealProps.dealstage ? [dealProps.dealstage] : ['closedwon'];

    return {
      deal_id: item.deal.id,
      deal_name: dealProps.dealname || 'Unnamed Deal',
      deal_value: dealProps.amount ? parseFloat(dealProps.amount) : 0,
      days_to_close,
      contact_job_titles,
      stage_sequence,
    };
  });
}
