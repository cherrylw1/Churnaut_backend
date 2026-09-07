// Next.js and Vercel functions imports
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '@/lib/supabase';
import { resolveRatelimit } from '@/lib/redis';
import { evaluateRules } from '@/lib/rules-engine';
import { PLAN_LIMITS } from '@/lib/plans';
import { Session } from '@/types/index';
import { enrichSessionFromHubSpot } from '@/lib/integrations/hubspot';
import { readJson, resolveRequestSchema } from '@/lib/validation';
import crypto from 'crypto';
import { normalizeEmbedUrl } from '@/lib/url';
import { isRegisteredClientOrigin } from '@/lib/domain-access';

export const dynamic = 'force-dynamic';


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
    // 1. Parse and validate request body.
    const parsedBody = await readJson(req, resolveRequestSchema);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400, headers: corsHeaders });
    }
    const { client_id: clientIdParam, signals, cookie, utms, page_url } = parsedBody.data;
    const signalValues = signals as Record<string, unknown>;
    const sid = typeof signalValues.sid === 'string' ? signalValues.sid : null;
    const gclid = typeof signalValues.gclid === 'string' ? signalValues.gclid : null;
    const fbclid = typeof signalValues.fbclid === 'string' ? signalValues.fbclid : null;
    const li_fat_id = typeof signalValues.li_fat_id === 'string' ? signalValues.li_fat_id : null;
    const ttclid = typeof signalValues.ttclid === 'string' ? signalValues.ttclid : null;
    const hasUtmSignal = Object.values(utms as Record<string, unknown>).some(Boolean);
    let resolvedSignalType: string | undefined;
    if (ttclid) resolvedSignalType = 'tiktok_ad';
    else if (gclid) resolvedSignalType = 'google_ad';
    else if (fbclid) resolvedSignalType = 'meta_ad';
    else if (li_fat_id) resolvedSignalType = 'linkedin_ad';

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
    if (!(await isRegisteredClientOrigin(client_id, req.headers.get('origin')))) {
      return NextResponse.json({ error: 'Unregistered website origin' }, { status: 403, headers: corsHeaders });
    }

    // Rate-limit before consuming quota. The key is client + source IP so one
    // visitor cannot exhaust the shared customer-wide bucket.
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const sourceIp = forwardedFor || req.headers.get('x-real-ip') || 'unknown';
    try {
      const { success } = await resolveRatelimit.limit(`resolve:${client_id}:${sourceIp}`);
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: corsHeaders }
        );
      }
    } catch (rlError) {
      console.error('[RateLimit Error] Failed to enforce resolve rate limiting:', rlError);
      // Keep the public snippet available if Redis is temporarily unavailable.
    }

    // 3. Look up the session in the sessions table by id matching sid
    let session: Session | null = null;
    let matchedTrackedLink = false;
    if (sid) {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', sid)
        .eq('client_id', client_id)
        .maybeSingle();

      if (!error) {
        session = data;
        matchedTrackedLink = !!data;
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
          (async () => {
            try {
              const { data: newClickCount, error: clickError } = await supabaseAdmin.rpc(
                'increment_click_count',
                { session_id_input: session!.id }
              );
              if (clickError) {
                console.error('[Click Count Error] Failed to increment click count:', clickError);
                return;
              }

              const { error: clickEventError } = await supabaseAdmin.from('analytics_events').insert({
                client_id,
                session_id: session!.id,
                event_type: 'link_clicked',
                signal_type: session!.signal_type || null,
                created_at: new Date().toISOString(),
                metadata: { schema_version: 2 },
              });
              if (clickEventError) console.error('[Analytics Error] Failed to log link click:', clickEventError);

              // Only the request that atomically changes 0 -> 1 sends the first
              // click notification. Concurrent resolves cannot duplicate it.
              if (newClickCount !== 1 || !session!.assigned_rep) return;
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
        .eq('client_id', client_id)
        .maybeSingle();

      if (!error && data) {
        session = data;
      }
    }

    if (session?.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ visitor_token: null, swaps: [] }, { headers: corsHeaders });
    }

    // A real tracked-link session takes precedence over unrelated ad query
    // parameters. Invalid or cross-tenant identifiers are ignored entirely.
    if (matchedTrackedLink) resolvedSignalType = undefined;
    if (!session && !resolvedSignalType && !hasUtmSignal) {
      return NextResponse.json({ visitor_token: null, swaps: [] }, { headers: corsHeaders });
    }

    // Count only requests that resolved to a real session or carry a supported
    // acquisition signal. Rate limiting has already happened above.
    const clientPlan = (clientData?.plan ?? 'starter') as keyof typeof PLAN_LIMITS;
    const visitLimit = PLAN_LIMITS[clientPlan]?.tracked_visits ?? 500;
    const currentVisits = clientData?.monthly_visits ?? 0;
    if (currentVisits >= visitLimit) {
      return NextResponse.json({ visitor_token: null, swaps: [] }, { headers: corsHeaders });
    }
    if (visitLimit !== Infinity) {
      const { data: quotaAvailable, error: quotaError } = await supabaseAdmin.rpc(
        'increment_monthly_visits_if_available',
        { client_id_input: client_id, visit_limit_input: visitLimit }
      );
      if (quotaError) {
        console.error('[Visit Counter Error] Failed to consume monthly quota:', quotaError);
        return NextResponse.json({ error: 'Visit quota service unavailable' }, { status: 503, headers: corsHeaders });
      }
      if (!quotaAvailable) {
        return NextResponse.json({ visitor_token: null, swaps: [] }, { headers: corsHeaders });
      }
    }

    const queueAnalyticsEvent = (
      eventType: 'rule_triggered' | 'no_match',
      ruleId: string | null,
      selector: string | null = null,
      preview: string | null = null
    ) => {
      const detectedSignal = session?.signal_type || (matchedTrackedLink ? 'sid' : (cookie ? 'cookie' : null));
      waitUntil(
        Promise.resolve(
          supabaseAdmin.from('analytics_events').insert({
            client_id,
            session_id: session?.id || null,
            rule_id: ruleId,
            event_type: eventType,
            signal_type: detectedSignal,
            created_at: new Date().toISOString(),
            metadata: { schema_version: 2, selector, content_preview: preview },
          })
        )
          .then(({ error }) => {
            if (error) console.error('[Analytics Error] Failed to log analytics event:', error);
          })
          .catch((err: unknown) => console.error('[Analytics Exception] Failed to execute analytics log:', err))
      );
    };

    if (session) {
      if (resolvedSignalType) {
        session.metadata = { ...(session.metadata || {}), acquisition_signal: session.metadata?.acquisition_signal || session.signal_type || resolvedSignalType };
        session.signal_type = resolvedSignalType;
      }
      if (!resolvedSignalType && !matchedTrackedLink && cookie) {
        session.metadata = { ...(session.metadata || {}), acquisition_signal: session.signal_type };
        session.visitor_type = 'returning_visitor';
        session.signal_type = 'returning_visitor';
      }
    } else if (resolvedSignalType || hasUtmSignal) {
      // Persist anonymous acquisition traffic so the visitor token survives the
      // first page view and returning-visitor rules have stable state.
      const anonymousId = crypto.randomUUID();
      // A supplied cookie reached this branch only because it did not resolve
      // for this tenant. Never reuse that untrusted token (it may belong to a
      // different tenant and visitor_token is globally unique).
      const visitorToken = crypto.randomUUID();
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('sessions')
        .insert({
          id: anonymousId,
          client_id,
          signal_type: resolvedSignalType || null,
          visitor_type: !resolvedSignalType && cookie ? 'returning_visitor' : null,
          visitor_token: visitorToken,
          session_kind: 'anonymous_visit',
          metadata: { utms: utms || {}, acquisition_signal: resolvedSignalType },
          click_count: 0,
          converted: false,
        })
        .select('*')
        .single();
      if (!insertError && inserted) session = inserted as Session;
      else if (insertError) console.error('[Resolve Error] Anonymous session insert failed:', insertError);
    }

    // Store the utms object in the session metadata
    if (session) {
      session.metadata = {
        ...(session.metadata || {}),
        utms: utms || {},
      };
    }
    waitUntil(
      Promise.resolve(supabaseAdmin.from('analytics_events').insert({
        client_id,
        session_id: session?.id || null,
        event_type: 'page_view',
        signal_type: session?.signal_type || resolvedSignalType || null,
        created_at: new Date().toISOString(),
        metadata: { schema_version: 2, page_url: page_url || null },
      }))
        .then(({ error }) => {
          if (error) console.error('[Analytics Error] Failed to log page view:', error);
        })
        .catch((error) => console.error('[Analytics Error] Failed to log page view:', error))
    );

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
      queueAnalyticsEvent('no_match', null);
      return NextResponse.json(
        { visitor_token: session?.visitor_token || null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    const swapsList: Array<{ selector: string; content: string }> = [];
    const actionSwaps = matchedRule.action_payload?.swaps;

    // The action type is canonical. A stale `swaps` array must never suppress
    // the calendar action and produce an empty iframe.
    if (matchedRule.action_type === 'show_calendar') {
      const target = matchedRule.target_selector || matchedRule.action_payload?.selector;
      if (target) {
        const rawCalUrl = String(matchedRule.action_payload?.calendar_url || session?.calendar_url || '');
        let safeCalUrl = '';
        try { safeCalUrl = normalizeEmbedUrl(rawCalUrl).replace(/"/g, '&quot;'); } catch {}
        if (safeCalUrl) swapsList.push({ selector: target, content: `<iframe src="${safeCalUrl}" width="100%" height="100%" frameborder="0" allow="camera; microphone; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>` });
      }
    } else if (matchedRule.action_type === 'inject_copy' && Array.isArray(actionSwaps) && actionSwaps.length > 0) {
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
    } else if (matchedRule.action_type === 'inject_copy') {
      // Fallback to the existing single selector/variant_content logic for backwards compatibility
      if (matchedRule.target_selector !== null && matchedRule.target_selector !== undefined) {
        let content = matchedRule.variant_content || '';
        content = replaceVariables(content, session);
        swapsList.push({
          selector: matchedRule.target_selector,
          content: content,
        });
      }
    }

    if (swapsList.length === 0) {
      queueAnalyticsEvent('no_match', null);
      return NextResponse.json(
        { visitor_token: session?.visitor_token || null, swaps: [] },
        { headers: corsHeaders }
      );
    }

    // Log rule triggered event using the first swap
    const firstSwap = swapsList[0];
    const contentPreview = firstSwap.content.length > 100 ? firstSwap.content.slice(0, 100) + '...' : firstSwap.content;
    queueAnalyticsEvent('rule_triggered', matchedRule.id, firstSwap.selector, contentPreview);

    const visitor_token = session?.visitor_token || null;
    const instructions = {
      visitor_token,
      swaps: swapsList,
    };

    return NextResponse.json(instructions, { headers: corsHeaders });

  } catch (error) {
    console.error('[Resolve Error] Unhandled exception occurred:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500, headers: corsHeaders }
    );
  }
}
