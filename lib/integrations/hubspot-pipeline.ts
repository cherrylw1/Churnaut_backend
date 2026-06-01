import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import { redis } from '@/lib/redis';

export interface ScoutDeal {
  deal_id: string;
  deal_name: string;
  stage: string;
  deal_value: number;
  close_date: string | null;
  days_in_stage: number;
  last_activity_days: number | null;
  contact_count: number;
  website_visits_7d: number;
}

/**
 * Fetches HubSpot pipeline data for a given client, enriches it with contact info
 * and recent website visits, and returns a sanitized list of open deals.
 * Caches results in Upstash Redis for 30 minutes.
 */
export async function fetchHubSpotPipeline(clientId: string): Promise<ScoutDeal[]> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  const cacheKey = `scout:pipeline:${clientId}`;

  // 1. Try Cache Read
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : (cached as ScoutDeal[]);
    }
  } catch (cacheErr) {
    console.error('[Scout Pipeline Cache Read Error] Failed to read from Redis:', cacheErr);
  }

  // 2. Look up the HubSpot access token in the crm_tokens table
  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token')
    .eq('client_id', clientId)
    .eq('crm_type', 'hubspot')
    .maybeSingle();

  if (tokenError || !tokenData) {
    console.warn(`[Scout Pipeline] No HubSpot OAuth connection found for client ${clientId}`);
    return [];
  }

  // 3. Decrypt the access token
  const accessToken = decrypt(tokenData.access_token);
  if (!accessToken) {
    throw new Error('Failed to decrypt HubSpot access token');
  }

  // 4. Fetch open deals from HubSpot CRM
  const dealsUrl = 'https://api.hubapi.com/crm/v3/objects/deals?properties=dealname,dealstage,amount,closedate,createdate,hs_lastmodifieddate,hubspot_owner_id&limit=100&archived=false';
  const dealsRes = await fetch(dealsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!dealsRes.ok) {
    const errBody = await dealsRes.json().catch(() => ({}));
    console.error(`[Scout Pipeline API Error] Deals fetch returned status ${dealsRes.status}:`, errBody);
    throw new Error(`Failed to fetch deals from HubSpot: ${dealsRes.statusText}`);
  }

  const dealsData = await dealsRes.json();
  const rawDeals = dealsData.results || [];

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
  };
}

interface ActivityProperties {
  notes_last_contacted?: string;
  hs_last_booked_meeting_date?: string;
  hs_last_sales_activity_timestamp?: string;
}

  // 5. Fetch associated contacts and last activity details for each deal
  const detailedDeals = await Promise.all(
    (rawDeals as HubSpotDealResult[]).map(async (deal) => {
      const dealId = deal.id;

      // Call associations endpoint for contact IDs
      let contactIds: string[] = [];
      try {
        const assocRes = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          contactIds = (assocData.results || []).map((r: { id: string }) => r.id);
        }
      } catch (err) {
        console.error(`[Scout Pipeline Error] Failed to fetch contacts for deal ${dealId}:`, err);
      }

      // Call details endpoint for specific activity properties
      let activityProperties: ActivityProperties = {};
      try {
        const activityRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=notes_last_contacted,hs_last_booked_meeting_date,hs_last_sales_activity_timestamp`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (activityRes.ok) {
          const activityData = await activityRes.json() as { properties?: ActivityProperties };
          activityProperties = activityData.properties || {};
        }
      } catch (err) {
        console.error(`[Scout Pipeline Error] Failed to fetch last activity for deal ${dealId}:`, err);
      }

      return {
        deal,
        contactIds,
        activityProperties,
      };
    })
  );

  // 6. Gather all unique contact IDs and batch read their emails
  const allContactIds = Array.from(new Set(detailedDeals.flatMap((d) => d.contactIds)));
  const contactIdToEmail = new Map<string, string>();

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
            properties: ['email'],
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
          }
        }
      } catch (err) {
        console.error('[Scout Pipeline Error] Contact batch fetch failed:', err);
      }
    }
  }

  // Map contact IDs to emails for each deal
  const dealsWithEmails = detailedDeals.map((d) => {
    const emails = d.contactIds
      .map((id) => contactIdToEmail.get(id))
      .filter((email): email is string => !!email);
    return {
      ...d,
      emails,
    };
  });

  // 7. Count website visits in the last 7 days via sessions table
  const allEmails = Array.from(new Set(dealsWithEmails.flatMap((d) => d.emails)));
  const emailToSessionIds = new Map<string, string[]>();
  const allSessionIds: string[] = [];

  if (allEmails.length > 0) {
    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from('sessions')
      .select('id, prospect_email')
      .eq('client_id', clientId)
      .in('prospect_email', allEmails);

    if (sessionsErr) {
      console.error('[Scout Pipeline DB Error] Failed fetching sessions:', sessionsErr);
    } else if (sessions) {
      for (const session of sessions) {
        if (session.prospect_email) {
          const email = session.prospect_email.toLowerCase().trim();
          const list = emailToSessionIds.get(email) || [];
          list.push(session.id);
          emailToSessionIds.set(email, list);
          allSessionIds.push(session.id);
        }
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
      const { data: events, error: eventsErr } = await supabaseAdmin
        .from('analytics_events')
        .select('session_id')
        .eq('client_id', clientId)
        .in('session_id', chunk)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (eventsErr) {
        console.error('[Scout Pipeline DB Error] Failed fetching analytics events:', eventsErr);
      } else if (events) {
        for (const ev of events) {
          if (ev.session_id) {
            sessionToEventCount.set(ev.session_id, (sessionToEventCount.get(ev.session_id) || 0) + 1);
          }
        }
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
    const createdate = dealProps.createdate;
    const hs_last_sales_activity_timestamp = item.activityProperties.hs_last_sales_activity_timestamp;

    // Calculate days_in_stage
    let days_in_stage = 0;
    if (createdate) {
      const diffMs = Date.now() - new Date(createdate).getTime();
      days_in_stage = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Calculate last_activity_days
    let last_activity_days: number | null = null;
    let lastActivityTimestamp = hs_last_sales_activity_timestamp;

    // Fallbacks
    if (!lastActivityTimestamp && item.activityProperties.notes_last_contacted) {
      lastActivityTimestamp = item.activityProperties.notes_last_contacted;
    }
    if (!lastActivityTimestamp && item.activityProperties.hs_last_booked_meeting_date) {
      lastActivityTimestamp = item.activityProperties.hs_last_booked_meeting_date;
    }

    if (lastActivityTimestamp) {
      const diffMs = Date.now() - new Date(lastActivityTimestamp).getTime();
      last_activity_days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      deal_id: item.deal.id,
      deal_name: dealProps.dealname || 'Unnamed Deal',
      stage: dealProps.dealstage || 'Unknown Stage',
      deal_value: dealProps.amount ? parseFloat(dealProps.amount) : 0,
      close_date: dealProps.closedate || null,
      days_in_stage,
      last_activity_days,
      contact_count: item.contactIds.length,
      website_visits_7d,
    };
  });

  // 9. Cache in Redis
  try {
    await redis.set(cacheKey, JSON.stringify(scoredDeals), { ex: 1800 });
  } catch (cacheErr) {
    console.error('[Scout Pipeline Cache Write Error] Failed to write to Redis:', cacheErr);
  }

  return scoredDeals;
}
