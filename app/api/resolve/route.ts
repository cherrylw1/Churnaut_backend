import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { redis, ratelimit } from '@/lib/redis';
import { evaluateRules } from '@/lib/rules-engine';
import { Session, RoutingRule } from '@/types/index';

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

// Request validation schema
const resolveSchema = z.object({
  client_id: z.string(),
  sid: z.string().optional().nullable(),
  gclid: z.string().optional().nullable(),
  fbclid: z.string().optional().nullable(),
  li_fat_id: z.string().optional().nullable(),
  cookie: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Validate request body
    const body = await req.json();
    const result = resolveSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: result.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const { client_id: snippetKey, sid, gclid, fbclid, li_fat_id, cookie } = result.data;

    // Look up the client using snippetKey (which is the client_id field from request body)
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('snippet_key', snippetKey)
      .maybeSingle();

    if (clientError || !clientData) {
      console.error('[Resolve Error] Client lookup failed or not found for snippetKey:', snippetKey, clientError);
      return NextResponse.json(
        { error: 'Unauthorized: invalid client key' },
        { status: 401, headers: corsHeaders }
      );
    }

    const client_id = clientData.id;
    console.log('[DEBUG] Resolved client_id UUID:', client_id);

    // 2. Rate limiting based on client_id
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
      // Soft fail on ratelimit errors to prevent breaking resolve calls
    }

    // Determine the primary signal
    const primarySignal = sid || gclid || fbclid || li_fat_id || cookie;

    // 3. Cache lookup (Temporarily disabled)
    let cacheKey = '';
    if (primarySignal) {
      cacheKey = `resolve:${client_id}:${primarySignal}`;
      /*
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const instructions = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return NextResponse.json(instructions, { headers: corsHeaders });
        }
      } catch (cacheError) {
        console.error('[Cache Error] Failed cache read:', cacheError);
      }
      */
    }

    // 4. Query Supabase for session data (Cache Miss)
    let session: Session | null = null;
    let signalType = '';

    try {
      if (sid) {
        signalType = 'sid';
        const { data, error } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('id', sid)
          .eq('client_id', client_id)
          .maybeSingle();

        if (error) throw error;
        session = data;
      } else if (gclid) {
        signalType = 'google_ads';
      } else if (fbclid) {
        signalType = 'facebook_ads';
      } else if (li_fat_id) {
        signalType = 'linkedin_ads';
      } else if (cookie) {
        signalType = 'cookie';
        const { data, error } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('visitor_token', cookie)
          .eq('client_id', client_id)
          .maybeSingle();

        if (error) throw error;
        session = data;
      }
    } catch (dbError) {
      console.error('[DB Error] Failed to fetch session data:', dbError);
    }

    // If no existing session was found, synthesize a minimal session mock
    if (!session) {
      session = {
        id: sid || '',
        client_id,
        signal_type: signalType,
        click_count: 0,
        converted: false,
        created_at: new Date().toISOString(),
      };
    } else if (signalType && !session.signal_type) {
      session.signal_type = signalType;
    }
    console.log('[DEBUG] Fetched/Synthesized session:', JSON.stringify(session, null, 2));

    // 5. Query active routing rules belonging to this client, ordered by priority
    let rules: RoutingRule[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('routing_rules')
        .select('*')
        .eq('client_id', client_id)
        .eq('active', true)
        .order('priority', { ascending: true });

      if (error) throw error;
      rules = data || [];
    } catch (rulesError) {
      console.error('[DB Error] Failed to fetch routing rules:', rulesError);
    }
    console.log(`[DEBUG] Found ${rules.length} active routing rules. Signal types:`, rules.map(r => r.signal_type || 'Any'));

    // 6. Evaluate matching rule
    const matchedRule = evaluateRules(session, rules);
    console.log('[DEBUG] Matched routing rule:', matchedRule ? JSON.stringify(matchedRule, null, 2) : 'null');

    // 7. Build the instructions swaps
    const swaps: Array<{ selector: string; content: string }> = [];
    const visitorToken = session?.visitor_token || cookie || crypto.randomUUID();

    if (matchedRule) {
      const selector = matchedRule.target_selector || matchedRule.action_payload?.selector || '.sr-target';
      let content = '';

      const copy = matchedRule.variant_content || matchedRule.action_payload?.variant_content || '';

      if (copy) {
        // If variant_content exists, always use it regardless of action_type
        content = copy
          .replace(/\{\{\s*prospect_name\s*\}\}/g, session?.prospect_name || 'there')
          .replace(/\{\{\s*company_name\s*\}\}/g, session?.company_name || 'your company')
          .replace(/\{\{\s*job_title\s*\}\}/g, session?.job_title || 'your role')
          .replace(/\{\{\s*assigned_rep\s*\}\}/g, session?.assigned_rep || 'our representative');
      } else if (matchedRule.action_type === 'show_calendar') {
        const calendarUrl = session?.calendar_url || matchedRule.action_payload?.calendar_url || '';
        if (calendarUrl) {
          content = `<iframe src="${calendarUrl}" width="100%" height="100%" frameborder="0"></iframe>`;
        }
      }

      if (selector && content) {
        swaps.push({ selector, content });
      }
    }

    const instructions = {
      visitor_token: visitorToken,
      swaps,
    };
    console.log('[DEBUG] Generated swaps array:', JSON.stringify(swaps, null, 2));

    // 8. Log analytics event asynchronously
    if (matchedRule) {
      (async () => {
        try {
          const { error } = await supabaseAdmin
            .from('analytics_events')
            .insert({
              client_id,
              session_id: session?.id || null,
              rule_id: matchedRule.id,
              event_type: 'resolve',
              signal_type: signalType || null,
              metadata: {
                rule_priority: matchedRule.priority,
                action_type: matchedRule.action_type,
              },
            });
          if (error) {
            console.error('[Analytics Error] Failed to log resolving event:', error);
          }
        } catch (err) {
          console.error('[Analytics Exception] Failed to execute analytics log:', err);
        }
      })();
    }

    // 9. Cache instructions in Redis with a 300 second TTL
    if (primarySignal && cacheKey) {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(instructions));
      } catch (cacheSetError) {
        console.error('[Cache Set Error] Failed to write to cache:', cacheSetError);
      }
    }

    // 10. Return CORS-enabled JSON
    return NextResponse.json(instructions, { headers: corsHeaders });

  } catch (error) {
    console.error('[Resolve Error] Unhandled exception occurred:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500, headers: corsHeaders }
    );
  }
}
