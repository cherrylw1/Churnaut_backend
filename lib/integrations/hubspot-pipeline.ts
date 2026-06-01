import { supabaseAdmin } from '@/lib/supabase';
import { decrypt, encrypt } from '@/lib/crypto';
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

interface ActivityProperties {
  notes_last_contacted?: string;
  hs_last_booked_meeting_date?: string;
  hs_last_sales_activity_timestamp?: string;
  hs_last_activity_date?: string;
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
  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('client_id', clientId)
    .eq('crm_type', 'hubspot')
    .order('updated_at', { ascending: false });

  if (tokenError) {
    console.error('[Scout Pipeline] Error fetching HubSpot token from crm_tokens:', tokenError);
  }

  const tokenData = tokens && tokens.length > 0 ? tokens[0] : null;

  if (!tokenData) {
    console.warn(`[Scout Pipeline] No HubSpot OAuth connection found for client ${clientId}`);
    return [];
  }

  // 3. Decrypt the access token
  let accessToken = decrypt(tokenData.access_token);
  if (!accessToken) {
    throw new Error('Failed to decrypt HubSpot access token');
  }

  // Check token expiration (refresh if expired or expiring within 5 minutes)
  const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
  const isExpired = expiresAt === 0 || expiresAt - Date.now() < 5 * 60 * 1000;

  if (isExpired && tokenData.refresh_token) {
    console.log('[HubSpot Pipeline] Access token is expired or expiring soon. Refreshing...');
    try {
      const decryptedRefreshToken = decrypt(tokenData.refresh_token);
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', process.env.HUBSPOT_CLIENT_ID || '');
      params.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET || '');
      params.append('redirect_uri', 'https://app.churnaut.com/api/oauth/hubspot/callback');
      params.append('refresh_token', decryptedRefreshToken);

      const refreshRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!refreshRes.ok) {
        const errBody = await refreshRes.text();
        console.error('[HubSpot Pipeline] Token refresh failed status:', refreshRes.status, errBody);
      } else {
        const refreshData = await refreshRes.json();
        const newAccessToken = refreshData.access_token;
        const newRefreshToken = refreshData.refresh_token;
        const newExpiresAt = new Date(Date.now() + 1800 * 1000).toISOString();

        // Encrypt new tokens
        const encryptedAccess = encrypt(newAccessToken);
        const encryptedRefresh = encrypt(newRefreshToken);

        // Update crm_tokens table
        const { error: updateError } = await supabaseAdmin
          .from('crm_tokens')
          .update({
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('client_id', clientId)
          .eq('crm_type', 'hubspot');

        if (updateError) {
          console.error('[HubSpot Pipeline] Failed to update refreshed tokens in DB:', updateError.message);
        } else {
          console.log('[HubSpot Pipeline] Token refreshed and updated successfully.');
          accessToken = newAccessToken;
        }
      }
    } catch (refreshErr) {
      console.error('[HubSpot Pipeline] Exception during token refresh:', refreshErr);
    }
  }

  console.log('[HubSpot Pipeline debug] Decrypted access token:', accessToken.substring(0, 20) + '...');

  // 4. Fetch open deals from HubSpot CRM
  const searchUrl = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  console.log('[HubSpot Pipeline debug] Fetching open deals from Search URL:', searchUrl);
  const dealsRes = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' }
          ]
        }
      ],
      properties: [
        'dealname',
        'dealstage',
        'amount',
        'closedate',
        'createdate',
        'hs_lastmodifieddate',
        'hubspot_owner_id',
        'hs_last_activity_date'
      ],
      limit: 100
    })
  });

  if (!dealsRes.ok) {
    const errBody = await dealsRes.json().catch(() => ({}));
    console.error(`[Scout Pipeline API Error] Deals fetch from Search URL "${searchUrl}" failed with status ${dealsRes.status}:`, errBody);
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
    hs_last_activity_date?: string;
  };
}

  // Log how many deals are returned and what their stages are after the fix
  const dealStages = (rawDeals as HubSpotDealResult[]).map((d) => d.properties?.dealstage || 'unknown');
  console.log(`[HubSpot Pipeline] Returned ${rawDeals.length} deals with stages:`, dealStages);

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
        } else {
          console.warn(`[Scout Pipeline Warning] Failed to fetch contacts for deal ${dealId}. Status: ${assocRes.status}`);
        }
      } catch (err) {
        console.error(`[Scout Pipeline Error] Failed to fetch contacts for deal ${dealId}:`, err);
      }

      // Call details endpoint for specific activity properties
      let activityProperties: ActivityProperties = {};
      try {
        const activityRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=notes_last_contacted,hs_last_booked_meeting_date,hs_last_sales_activity_timestamp,hs_last_activity_date`,
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
        } else {
          console.warn(`[Scout Pipeline Warning] Failed to fetch activities for deal ${dealId}. Status: ${activityRes.status}`);
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
    let lastActivityTimestamp = item.activityProperties.hs_last_activity_date || dealProps.hs_last_activity_date || hs_last_sales_activity_timestamp;

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
    await redis.set(cacheKey, JSON.stringify(scoredDeals), { ex: 60 });
  } catch (cacheErr) {
    console.error('[Scout Pipeline Cache Write Error] Failed to write to Redis:', cacheErr);
  }

  return scoredDeals;
}

export interface ScoutClosedLostDeal {
  deal_id: string;
  deal_name: string;
  stage: string;
  deal_value: number;
  close_date: string | null;
  days_in_stage: number;
  last_activity_days: number | null;
  contact_count: number;
}

export async function fetchClosedLostDeals(clientId: string): Promise<ScoutClosedLostDeal[]> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  // 1. Look up the HubSpot access token in the crm_tokens table
  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('client_id', clientId)
    .eq('crm_type', 'hubspot')
    .order('updated_at', { ascending: false });

  if (tokenError) {
    console.error('[Scout Closed Lost] Error fetching HubSpot token from crm_tokens:', tokenError);
  }

  const tokenData = tokens && tokens.length > 0 ? tokens[0] : null;
  if (!tokenData) {
    console.warn(`[Scout Closed Lost] No HubSpot OAuth connection found for client ${clientId}`);
    return [];
  }

  // 2. Decrypt the access token
  let accessToken = decrypt(tokenData.access_token);
  if (!accessToken) {
    throw new Error('Failed to decrypt HubSpot access token');
  }

  // Check token expiration (refresh if expired or expiring within 5 minutes)
  const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
  const isExpired = expiresAt === 0 || expiresAt - Date.now() < 5 * 60 * 1000;

  if (isExpired && tokenData.refresh_token) {
    console.log('[HubSpot Closed Lost] Access token is expired or expiring soon. Refreshing...');
    try {
      const decryptedRefreshToken = decrypt(tokenData.refresh_token);
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', process.env.HUBSPOT_CLIENT_ID || '');
      params.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET || '');
      params.append('redirect_uri', 'https://app.churnaut.com/api/oauth/hubspot/callback');
      params.append('refresh_token', decryptedRefreshToken);

      const refreshRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!refreshRes.ok) {
        const errBody = await refreshRes.text();
        console.error('[HubSpot Closed Lost] Token refresh failed status:', refreshRes.status, errBody);
      } else {
        const refreshData = await refreshRes.json();
        const newAccessToken = refreshData.access_token;
        const newRefreshToken = refreshData.refresh_token;
        const newExpiresAt = new Date(Date.now() + 1800 * 1000).toISOString();

        const encryptedAccess = encrypt(newAccessToken);
        const encryptedRefresh = encrypt(newRefreshToken);

        const { error: updateError } = await supabaseAdmin
          .from('crm_tokens')
          .update({
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('client_id', clientId)
          .eq('crm_type', 'hubspot');

        if (updateError) {
          console.error('[HubSpot Closed Lost] Failed to update refreshed tokens in DB:', updateError.message);
        } else {
          console.log('[HubSpot Closed Lost] Token refreshed and updated successfully.');
          accessToken = newAccessToken;
        }
      }
    } catch (refreshErr) {
      console.error('[HubSpot Closed Lost] Exception during token refresh:', refreshErr);
    }
  }

  // 3. Search closed lost deals from HubSpot CRM
  const searchUrl = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  const searchRes = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'dealstage',
              operator: 'EQ',
              value: 'closedlost'
            }
          ]
        }
      ],
      properties: ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_last_activity_date'],
      limit: 100
    })
  });

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}));
    console.error(`[Scout Closed Lost API Error] Deals search failed:`, errBody);
    throw new Error(`Failed to search closedlost deals: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  const rawDeals = searchData.results || [];

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
    };
  }

  // 4. Fetch associated contacts and last activity details
  const closedLostDeals: ScoutClosedLostDeal[] = await Promise.all(
    (rawDeals as HubSpotDealResult[]).map(async (deal) => {
      const dealId = deal.id;

      // Call associations endpoint for contacts
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
        console.error(`[Scout Closed Lost Error] Failed to fetch contacts for deal ${dealId}:`, err);
      }

      // Call details endpoint for activity properties
      let activityProperties: ActivityProperties = {};
      try {
        const activityRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=notes_last_contacted,hs_last_booked_meeting_date,hs_last_sales_activity_timestamp,hs_last_activity_date`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (activityRes.ok) {
          const activityData = await activityRes.json();
          activityProperties = activityData.properties || {};
        }
      } catch (err) {
        console.error(`[Scout Closed Lost Error] Failed to fetch last activity for deal ${dealId}:`, err);
      }

      const dealProps = deal.properties || {};
      const createdate = dealProps.createdate;
      const hs_last_sales_activity_timestamp = activityProperties.hs_last_sales_activity_timestamp;

      // Calculate days_in_stage (or final stage duration)
      let days_in_stage = 0;
      if (createdate) {
        const diffMs = Date.now() - new Date(createdate).getTime();
        days_in_stage = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Calculate last_activity_days
      let last_activity_days: number | null = null;
      let lastActivityTimestamp = activityProperties.hs_last_activity_date || dealProps.hs_last_activity_date || hs_last_sales_activity_timestamp;

      if (!lastActivityTimestamp && activityProperties.notes_last_contacted) {
        lastActivityTimestamp = activityProperties.notes_last_contacted;
      }
      if (!lastActivityTimestamp && activityProperties.hs_last_booked_meeting_date) {
        lastActivityTimestamp = activityProperties.hs_last_booked_meeting_date;
      }

      if (lastActivityTimestamp) {
        const diffMs = Date.now() - new Date(lastActivityTimestamp).getTime();
        last_activity_days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

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
    })
  );

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

  // 1. Look up the HubSpot access token in the crm_tokens table
  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from('crm_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('client_id', clientId)
    .eq('crm_type', 'hubspot')
    .order('updated_at', { ascending: false });

  if (tokenError) {
    console.error('[Scout Closed Won] Error fetching HubSpot token:', tokenError);
  }

  const tokenData = tokens && tokens.length > 0 ? tokens[0] : null;
  if (!tokenData) {
    console.warn(`[Scout Closed Won] No HubSpot OAuth connection found for client ${clientId}`);
    return [];
  }

  // 2. Decrypt access token
  let accessToken = decrypt(tokenData.access_token);
  if (!accessToken) {
    throw new Error('Failed to decrypt HubSpot access token');
  }

  // Check token expiration
  const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
  const isExpired = expiresAt === 0 || expiresAt - Date.now() < 5 * 60 * 1000;

  if (isExpired && tokenData.refresh_token) {
    console.log('[HubSpot Closed Won] Access token is expired or expiring soon. Refreshing...');
    try {
      const decryptedRefreshToken = decrypt(tokenData.refresh_token);
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', process.env.HUBSPOT_CLIENT_ID || '');
      params.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET || '');
      params.append('redirect_uri', 'https://app.churnaut.com/api/oauth/hubspot/callback');
      params.append('refresh_token', decryptedRefreshToken);

      const refreshRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!refreshRes.ok) {
        const errBody = await refreshRes.text();
        console.error('[HubSpot Closed Won] Token refresh failed status:', refreshRes.status, errBody);
      } else {
        const refreshData = await refreshRes.json();
        const newAccessToken = refreshData.access_token;
        const newRefreshToken = refreshData.refresh_token;
        const newExpiresAt = new Date(Date.now() + 1800 * 1000).toISOString();

        const encryptedAccess = encrypt(newAccessToken);
        const encryptedRefresh = encrypt(newRefreshToken);

        const { error: updateError } = await supabaseAdmin
          .from('crm_tokens')
          .update({
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('client_id', clientId)
          .eq('crm_type', 'hubspot');

        if (updateError) {
          console.error('[HubSpot Closed Won] Failed to update refreshed tokens in DB:', updateError.message);
        } else {
          console.log('[HubSpot Closed Won] Token refreshed and updated successfully.');
          accessToken = newAccessToken;
        }
      }
    } catch (refreshErr) {
      console.error('[HubSpot Closed Won] Exception during token refresh:', refreshErr);
    }
  }

  // 3. Search closedwon deals from HubSpot CRM
  const searchUrl = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  const searchRes = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'dealstage',
              operator: 'EQ',
              value: 'closedwon'
            }
          ]
        }
      ],
      properties: ['dealname', 'dealstage', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id', 'hs_last_activity_date'],
      limit: 100
    })
  });

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}));
    console.error(`[Scout Closed Won API Error] Deals search failed:`, errBody);
    throw new Error(`Failed to search closedwon deals: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  const rawDeals = searchData.results || [];

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
    };
  }

  // 4. Fetch contact associations for each deal
  const detailedDeals = await Promise.all(
    (rawDeals as HubSpotDealResult[]).map(async (deal) => {
      const dealId = deal.id;
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
        console.error(`[Scout Closed Won Error] Failed to fetch contacts for deal ${dealId}:`, err);
      }

      return {
        deal,
        contactIds,
      };
    })
  );

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
        console.error('[Scout Closed Won Error] Contact batch fetch failed:', err);
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


