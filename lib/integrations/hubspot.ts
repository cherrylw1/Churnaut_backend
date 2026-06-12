import { redis } from '@/lib/redis';
import { getValidHubSpotToken } from '@/lib/integrations/hubspot-pipeline';

export interface HubSpotEnrichment {
  contact_name: string;
  job_title: string | null;
  company_name: string | null;
  deal_stage: string | null;
  deal_name: string | null;
  deal_amount: string | null;
  rep_name: string | null;
  rep_email: string | null;
}

/**
 * Enriches session details in real-time by querying HubSpot CRM using the client's credentials.
 * Utilizes Redis caching with a 5-minute TTL to respect HubSpot's API limits.
 */
export async function enrichSessionFromHubSpot(
  clientId: string,
  prospectEmail: string
): Promise<HubSpotEnrichment | null> {
  if (!clientId || !prospectEmail) {
    return null;
  }

  const cacheKey = `hubspot:${clientId}:${prospectEmail.trim().toLowerCase()}`;

  // 1. Check Upstash Redis cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      if (parsed.contact_not_found) {
        return null;
      }
      return parsed as HubSpotEnrichment;
    }
  } catch (err) {
    console.error('[HubSpot Cache Read Error] Failed to read from Redis:', err);
  }

  try {
    // 2. Get valid HubSpot access token (handles lookup, decrypt, refresh)
    const accessToken = await getValidHubSpotToken(clientId);
    if (!accessToken) return null;

    // 4. Search HubSpot Contacts by email
    const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
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
                propertyName: 'email',
                operator: 'EQ',
                value: prospectEmail.trim(),
              },
            ],
          },
        ],
        properties: ['firstname', 'lastname', 'jobtitle', 'company', 'hs_lead_status'],
      }),
    });

    if (!searchResponse.ok) {
      const errBody = await searchResponse.json().catch(() => ({}));
      console.error(
        `[HubSpot API Error] Contact search returned status ${searchResponse.status}:`,
        errBody
      );
      return null;
    }

    const searchData = await searchResponse.json();
    if (!searchData.results || searchData.results.length === 0) {
      // Cache "not found" state to prevent spamming the API
      try {
        await redis.set(cacheKey, JSON.stringify({ contact_not_found: true }), { ex: 300 });
      } catch (err) {
        console.error('[HubSpot Cache Set Error] Failed to write not-found status to Redis:', err);
      }
      return null;
    }

    const contact = searchData.results[0];
    const contactId = contact.id;
    const props = contact.properties || {};

    const enrichment: HubSpotEnrichment = {
      contact_name: `${props.firstname || ''} ${props.lastname || ''}`.trim(),
      job_title: props.jobtitle || null,
      company_name: props.company || null,
      deal_stage: null,
      deal_name: null,
      deal_amount: null,
      rep_name: null,
      rep_email: null,
    };

    // 5. Fetch associated deals
    let dealId: string | null = null;
    try {
      const assocResponse = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (assocResponse.ok) {
        const assocData = await assocResponse.json();
        if (assocData.results && assocData.results.length > 0) {
          dealId = assocData.results[0].id;
        }
      } else {
        console.warn(
          `[HubSpot API Warning] Associations returned status ${assocResponse.status} for contact ${contactId}`
        );
      }
    } catch (err) {
      console.error('[HubSpot API Exception] Failed to query deals associations:', err);
    }

    // 6. Fetch Deal details
    let ownerId: string | null = null;
    if (dealId) {
      try {
        const dealResponse = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealstage,dealname,amount,hubspot_owner_id`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (dealResponse.ok) {
          const dealData = await dealResponse.json();
          const dealProps = dealData.properties || {};
          enrichment.deal_stage = dealProps.dealstage || null;
          enrichment.deal_name = dealProps.dealname || null;
          enrichment.deal_amount = dealProps.amount || null;
          ownerId = dealProps.hubspot_owner_id || null;
        } else {
          console.warn(`[HubSpot API Warning] Deal details returned status ${dealResponse.status} for deal ${dealId}`);
        }
      } catch (err) {
        console.error('[HubSpot API Exception] Failed to query deal details:', err);
      }
    }

    // 7. Fetch Owner details
    if (ownerId) {
      try {
        const ownerResponse = await fetch(`https://api.hubapi.com/crm/v3/owners/${ownerId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (ownerResponse.ok) {
          const ownerData = await ownerResponse.json();
          enrichment.rep_name = `${ownerData.firstName || ''} ${ownerData.lastName || ''}`.trim() || null;
          enrichment.rep_email = ownerData.email || null;
        } else {
          console.warn(`[HubSpot API Warning] Owner details returned status ${ownerResponse.status} for owner ${ownerId}`);
        }
      } catch (err) {
        console.error('[HubSpot API Exception] Failed to query owner details:', err);
      }
    }

    // 8. Cache successful enrichment result for 5 minutes
    try {
      await redis.set(cacheKey, JSON.stringify(enrichment), { ex: 300 });
    } catch (err) {
      console.error('[HubSpot Cache Set Error] Failed to cache enrichment in Redis:', err);
    }

    return enrichment;
  } catch (err) {
    console.error('[HubSpot Enrichment Exception] Unexpected error during enrichment:', err);
    return null;
  }
}
