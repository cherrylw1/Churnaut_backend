// Next.js and Vercel functions imports
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
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

// Helper to replace dynamic variables in content template with session context
function replaceVariables(content: string, session: Session | null): string {
  if (!content) return '';
  if (!session) {
    return content.replace(/{{\s*\w+\s*}}/g, '');
  }

  const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const sessionRecord = session as unknown as Record<string, unknown>;
  const vars: Record<string, string | undefined> = {
    prospect_name: session.prospect_name || undefined,
    company_name: session.company_name || undefined,
    rep_name: session.assigned_rep || (sessionRecord.rep_name as string) || undefined,
    industry: (session.metadata?.industry as string) || (sessionRecord.industry as string) || undefined,
    deal_stage: session.deal_stage || undefined,
    job_title: session.job_title || undefined,
    rep_email: (session.metadata?.rep_email as string) || (sessionRecord.rep_email as string) || undefined,
    deal_name: (session.metadata?.deal_name as string) || (sessionRecord.deal_name as string) || undefined,
    event_name: (session.metadata?.event_name as string) || (sessionRecord.event_name as string) || undefined,
  };

  let result = content;
  Object.entries(vars).forEach(([key, val]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    const escapedVal = val ? escapeHtml(val) : '';
    result = result.replace(regex, escapedVal);
  });

  // Replace any unmatched variable tokens with an empty string
  result = result.replace(/{{\s*\w+\s*}}/g, '');

  return result;
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

    if (!clientIdParam) {
      return NextResponse.json(
        { error: 'Missing client_id parameter' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. Look up the client in the clients table by snippet_key matching client_id
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, crm_type, plan, monthly_visits')
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

    // Visit limit check
    const planLimits: Record<string, number> = {
      starter: 500,
      growth: 5000,
      pro: Infinity,
    }
    const clientPlan = clientData?.plan ?? 'starter'
    const visitLimit = planLimits[clientPlan] ?? 500
    const currentVisits = clientData?.monthly_visits ?? 0

    if (currentVisits >= visitLimit) {
      return NextResponse.json(
        { visitor_token: null, swaps: [] },
        { headers: corsHeaders }
      )
    }

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

      if (session && session.expires_at) {
        const isExpired = new Date(session.expires_at).getTime() < Date.now();
        if (isExpired) {
          return NextResponse.json(
            { visitor_token: null, swaps: [] },
            { headers: corsHeaders }
          );
        }
      }

      if (session && session.id && sid) {
        waitUntil(
          Promise.resolve(supabaseAdmin.rpc('increment_click_count', { session_id: session!.id }))
            .then(() => {})
            .catch((err: unknown) => console.error('[Click Count Error] Failed to increment click count:', err))
        );
      }

      if (session && session.click_count === 0 && session.assigned_rep) {
        waitUntil(
          (async () => {
            try {
              const sessionRecord = session as unknown as Record<string, unknown>;
              const repEmail = (sessionRecord.rep_email as string) || null;
              if (repEmail) {
                const { sendClickNotification } = await import('@/lib/email/resend');
                await sendClickNotification(
                  repEmail,
                  session!.prospect_name || 'A prospect',
                  session!.company_name || null,
                  session!.signal_type || null,
                  session!.id
                );
              }
            } catch (err) {
              console.error('[Click Notification Error] Failed to send click notification:', err);
            }
          })()
        );
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
        const timeoutPromise = new Promise<unknown>((resolve) => setTimeout(() => resolve(null), 1200));
        const enrichment = (await Promise.race([
          enrichSessionFromHubSpot(client_id, session.prospect_email),
          timeoutPromise,
        ])) as {
          contact_name?: string | null;
          job_title?: string | null;
          company_name?: string | null;
          deal_stage?: string | null;
          rep_name?: string | null;
          deal_name?: string | null;
          deal_amount?: number | null;
          rep_email?: string | null;
        } | null;

        if (enrichment === null) {
          console.warn('[Enrichment Timeout] HubSpot live enrichment timed out after 1.2s');
        } else if (enrichment) {
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
      waitUntil(
        Promise.resolve(
          supabaseAdmin
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
            })
        )
        .then(({ error }) => {
          if (error) console.error('[Analytics Error] Failed to log analytics event:', error);
        })
        .catch((err: unknown) => console.error('[Analytics Exception] Failed to execute analytics log:', err))
      );
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

    // 6. If matchedRule is null, return JSON: {visitor_token: null, swaps: []}
    if (!matchedRule) {
      logAnalyticsEvent('no_match', null);
      return NextResponse.json(
        { visitor_token: null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    const swapsList: Array<{ selector: string; content: string }> = [];
    const actionSwaps = matchedRule.action_payload?.swaps;

    if (Array.isArray(actionSwaps) && actionSwaps.length > 0) {
      for (const s of actionSwaps) {
        if (s && typeof s === 'object' && 'selector' in s) {
          const swapRecord = s as Record<string, unknown>;
          const sel = (swapRecord.selector as string) || '';
          const rawContent = (swapRecord.content as string) || '';
          const interpolated = replaceVariables(rawContent, session);
          swapsList.push({
            selector: sel,
            content: interpolated,
          });
        }
      }
    } else {
      // Fallback to the existing single selector/variant_content logic for backwards compatibility
      if (matchedRule.target_selector !== null && matchedRule.target_selector !== undefined) {
        let content = matchedRule.variant_content || '';
        if (matchedRule.action_type === 'show_calendar') {
          const rawCalUrl = (matchedRule.action_payload?.calendar_url || session?.calendar_url || '').toString();
          const safeCalUrl = /^https?:\/\//i.test(rawCalUrl) ? rawCalUrl.replace(/"/g, '&quot;') : '';
          content = safeCalUrl
            ? `<iframe src="${safeCalUrl}" width="100%" height="100%" frameborder="0"></iframe>`
            : '';
        }
        content = replaceVariables(content, session);
        swapsList.push({
          selector: matchedRule.target_selector,
          content: content,
        });
      }
    }

    if (swapsList.length === 0) {
      logAnalyticsEvent('no_match', null);
      return NextResponse.json(
        { visitor_token: null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    // Log rule triggered event using the first swap
    const firstSwap = swapsList[0];
    const contentPreview = firstSwap.content.length > 100 ? firstSwap.content.slice(0, 100) + '...' : firstSwap.content;
    logAnalyticsEvent('rule_triggered', matchedRule.id, firstSwap.selector, contentPreview);

    // 8. Cache instructions in Redis with a 300 second TTL
    const visitor_token = session?.visitor_token || null;
    const instructions = {
      visitor_token,
      swaps: swapsList,
    };

    if (primarySignal && cacheKey) {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(instructions));
      } catch (cacheSetError) {
        console.error('[Cache Set Error] Failed to write to cache:', cacheSetError);
      }
    }

    // Increment monthly visit counter — waitUntil ensures it runs even after response returns
    waitUntil(
      Promise.resolve(supabaseAdmin.rpc('increment_monthly_visits', { client_id_input: client_id }))
        .then(() => {})
        .catch((err: unknown) => console.error('[Visit Counter Error] Failed to increment monthly visits:', err))
    )

    return NextResponse.json(instructions, { headers: corsHeaders });

  } catch (error) {
    console.error('[Resolve Error] Unhandled exception occurred:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500, headers: corsHeaders }
    );
  }
}
