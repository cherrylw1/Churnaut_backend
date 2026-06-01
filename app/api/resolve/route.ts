import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ratelimit, redis } from '@/lib/redis';
import { evaluateRules } from '@/lib/rules-engine';
import { Session } from '@/types/index';
import { enrichSessionFromHubSpot } from '@/lib/integrations/hubspot';

// CORS headers configuration helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS Preflight Options
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1. Parse request body and get client_id, signals, cookie fields
    const body = await req.json();
    const { client_id: clientIdParam, signals, cookie, utms } = body;
    const sid = signals?.sid;
    const gclid = signals?.gclid;
    const fbclid = signals?.fbclid;
    const li_fat_id = signals?.li_fat_id;
    const ttclid = signals?.ttclid;

    if (cookie) {
      console.log('[DEBUG] Resolve request cookie present:', cookie);
    }

    if (!clientIdParam) {
      return NextResponse.json(
        { error: 'Missing client_id parameter' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. Look up the client in the clients table by snippet_key matching client_id
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, crm_type')
      .eq('snippet_key', clientIdParam)
      .maybeSingle();

    if (clientError || !clientData) {
      console.error('[Resolve Error] Client lookup failed for key:', clientIdParam, clientError);
      return NextResponse.json(
        { error: 'Unauthorized: invalid client key' },
        { status: 401, headers: corsHeaders }
      );
    }

    const client_id = clientData.id;

    // Rate limiting
    try {
      const { success } = await ratelimit.limit(client_id);
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: corsHeaders }
        );
      }
    } catch (rlError) {
      console.error('[RateLimit Error] Failed to enforce rate limiting:', rlError);
    }

    const primarySignal = sid || cookie;
    let cacheKey = '';
    if (primarySignal) {
      cacheKey = `resolve:${client_id}:${primarySignal}`;
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const instructions = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return NextResponse.json(instructions, { headers: corsHeaders });
        }
      } catch (cacheError) {
        console.error('[Cache Error] Failed cache read:', cacheError);
      }
    }

    // 3. Look up the session in the sessions table by id matching sid
    let session: Session | null = null;
    if (sid) {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', sid)
        .maybeSingle();

      if (!error) {
        session = data;
      }
    }

    // Fallback: Look up the session by visitor_token matching cookie
    if (!session && cookie) {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('visitor_token', cookie)
        .maybeSingle();

      if (!error && data) {
        session = data;
      }
    }

    // Resolve signal type based on incoming parameters
    let resolvedSignalType: string | undefined = undefined;
    if (ttclid) {
      resolvedSignalType = 'tiktok_ad';
    } else if (!sid && gclid) {
      resolvedSignalType = 'google_ad';
    } else if (fbclid) {
      resolvedSignalType = 'meta_ad';
    } else if (li_fat_id) {
      resolvedSignalType = 'linkedin_ad';
    }

    if (session) {
      if (resolvedSignalType && !session.signal_type) {
        session.signal_type = resolvedSignalType;
      }
    } else {
      session = {
        id: sid || '',
        client_id,
        signal_type: resolvedSignalType || (sid ? 'sid' : (cookie ? 'cookie' : undefined)),
        click_count: 0,
        converted: false,
        created_at: new Date().toISOString(),
      } as Session;
    }

    // Store the utms object in the session metadata
    if (session) {
      session.metadata = {
        ...(session.metadata || {}),
        utms: utms || {},
      };
    }

    // 3.5 Live HubSpot CRM Session Enrichment
    if (clientData.crm_type === 'hubspot' && session?.prospect_email) {
      try {
        const enrichment = await enrichSessionFromHubSpot(client_id, session.prospect_email);
        if (enrichment) {
          session.prospect_name = enrichment.contact_name || session.prospect_name;
          session.job_title = enrichment.job_title || session.job_title;
          session.company_name = enrichment.company_name || session.company_name;
          session.deal_stage = enrichment.deal_stage || session.deal_stage;
          session.assigned_rep = enrichment.rep_name || session.assigned_rep;

          // Merge extra properties onto the session object for rules evaluation
          const sessionRecord = session as unknown as Record<string, unknown>;
          sessionRecord.deal_name = enrichment.deal_name;
          sessionRecord.deal_amount = enrichment.deal_amount;
          sessionRecord.rep_email = enrichment.rep_email;
          sessionRecord.contact_name = enrichment.contact_name;
        }
      } catch (enrichError) {
        console.error('[Enrichment Error] HubSpot live enrichment failed:', enrichError);
      }
    }

    // Helper to log analytics events asynchronously
    const logAnalyticsEvent = (
      eventType: 'rule_triggered' | 'no_match',
      ruleId: string | null,
      selector: string | null = null,
      preview: string | null = null
    ) => {
      const detectedSignal = session?.signal_type || (sid ? 'sid' : (cookie ? 'cookie' : null));
      (async () => {
        try {
          const { error } = await supabaseAdmin
            .from('analytics_events')
            .insert({
              client_id,
              session_id: session?.id || null,
              rule_id: ruleId,
              event_type: eventType,
              signal_type: detectedSignal,
              created_at: new Date().toISOString(),
              metadata: {
                selector,
                content_preview: preview,
              },
            });
          if (error) {
            console.error('[Analytics Error] Failed to log analytics event:', error);
          }
        } catch (err) {
          console.error('[Analytics Exception] Failed to execute analytics log:', err);
        }
      })();
    };

    // 4. Fetch all active routing rules for the client ordered by priority ascending
    const { data: rulesData, error: rulesError } = await supabaseAdmin
      .from('routing_rules')
      .select('*')
      .eq('client_id', client_id)
      .eq('active', true)
      .order('priority', { ascending: true });

    if (rulesError) {
      console.error('[Resolve Error] Rules lookup failed:', rulesError);
    }

    const rules = rulesData || [];

    // 5. Call evaluateRules with the session and rules
    const matchedRule = evaluateRules(session, rules);

    // 6. If matchedRule is null or matchedRule.target_selector is null, return JSON: {visitor_token: null, swaps: []}
    if (!matchedRule || matchedRule.target_selector === null || matchedRule.target_selector === undefined) {
      logAnalyticsEvent('no_match', null);
      return NextResponse.json(
        { visitor_token: null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    // 7. Build one swap: {selector: matchedRule.target_selector, content: matchedRule.variant_content}
    let content = matchedRule.variant_content || '';
    if (matchedRule.action_type === 'show_calendar') {
      const calendarUrl = matchedRule.action_payload?.calendar_url || session?.calendar_url || '';
      content = `<iframe src="${calendarUrl}" width="100%" height="100%" frameborder="0"></iframe>`;
    }

    const swap = {
      selector: matchedRule.target_selector,
      content: content,
    };

    // Log rule triggered event
    const contentPreview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    logAnalyticsEvent('rule_triggered', matchedRule.id, matchedRule.target_selector, contentPreview);

    // 8. Cache instructions in Redis with a 300 second TTL
    const visitor_token = session?.visitor_token || null;
    const instructions = {
      visitor_token,
      swaps: [swap],
    };

    if (primarySignal && cacheKey) {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(instructions));
      } catch (cacheSetError) {
        console.error('[Cache Set Error] Failed to write to cache:', cacheSetError);
      }
    }

    return NextResponse.json(instructions, { headers: corsHeaders });

  } catch (error) {
    console.error('[Resolve Error] Unhandled exception occurred:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500, headers: corsHeaders }
    );
  }
}
