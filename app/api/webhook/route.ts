import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { redis, ratelimit } from '@/lib/redis';

export const dynamic = 'force-dynamic';


// Helper to extract value from nested paths (e.g. "prospect.email")
function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

// Helper to generate a unique 6-character session ID
function generateSessionId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    let key = '';
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      key = authHeader.substring(7).trim();
    } else {
      const { searchParams } = new URL(req.url);
      key = searchParams.get('client_key') || '';
    }

    if (!key) {
      return NextResponse.json({ error: 'Missing client_key or Authorization Bearer token' }, { status: 401 });
    }

    // Lookup client by webhook_secret or legacy snippet_key
    let client = null;
    let clientErr = null;

    // First try webhook_secret
    const { data: clientBySecret, error: secretErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('webhook_secret', key)
      .maybeSingle();

    client = clientBySecret;
    clientErr = secretErr;

    if (!client && !clientErr) {
      // Fallback to legacy snippet_key
      const { data: clientByKey, error: keyErr } = await supabaseAdmin
        .from('clients')
        .select('*')
        .eq('snippet_key', key)
        .maybeSingle();

      client = clientByKey;
      clientErr = keyErr;
      if (client) {
        console.warn('[DEPRECATION WARNING] Webhook authenticated using snippet_key. Please transition to using webhook_secret.');
      }
    }

    if (clientErr || !client) {
      console.error('[Webhook Auth Error] Failed client lookup:', clientErr);
      return NextResponse.json({ error: 'Unauthorized client key' }, { status: 401 });
    }

    const clientId = client.id;

    // Rate Limiting by client ID
    try {
      const { success } = await ratelimit.limit(clientId);
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    } catch (rlError) {
      console.error('[RateLimit Error] Failed to enforce rate limiting on webhook:', rlError);
    }

    // 2. Parse Incoming Payload
    const payload = await req.json();
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // 3. Query Webhook Field Mappings
    const { data: mappings, error: mappingsErr } = await supabaseAdmin
      .from('webhook_mappings')
      .select('*')
      .eq('client_id', clientId);

    if (mappingsErr) {
      console.error('[Webhook Mapping Error] Mappings fetch failed:', mappingsErr);
      // Soft-fail: continue without mappings, using standard fallback keys
    }

    const isLinkedInLeadGen = payload.linkedin_lead_gen_form_id !== undefined || payload.li_form_id !== undefined;

    // 4. Apply Mappings to Transform Payload
    const transformed: Record<string, unknown> = {};
    if (isLinkedInLeadGen) {
      const firstName = (payload.firstName || '') as string;
      const lastName = (payload.lastName || '') as string;
      transformed.prospect_name = [firstName, lastName].filter(Boolean).join(' ') || null;
      transformed.prospect_email = payload.emailAddress || null;
      transformed.job_title = payload.title || null;
      transformed.company_name = payload.companyName || null;
      transformed.signal_type = 'linkedin_lead_gen';
    } else if (mappings && mappings.length > 0) {
      for (const mapping of mappings) {
        const val = getValueByPath(payload, mapping.external_field);
        if (val !== undefined) {
          transformed[mapping.internal_field] = val;
        }
      }
    } else {
      // Fallback matching logic
      const standardFields = [
        'session_id',
        'prospect_name',
        'prospect_email',
        'company_name',
        'job_title',
        'signal_type',
        'assigned_rep',
        'calendar_url',
        'crm_deal_id',
        'deal_stage',
        'visitor_type',
        'converted',
        'visitor_email',
      ];
      for (const field of standardFields) {
        if (payload[field] !== undefined) {
          transformed[field] = payload[field];
        }
      }
    }

    // Standardize Conversion Boolean
    if (transformed.converted !== undefined) {
      const convVal = transformed.converted;
      if (typeof convVal === 'string') {
        const normalized = convVal.toLowerCase().trim();
        transformed.converted = ['true', '1', 'yes', 'won', 'closed won', 'converted', 'active'].includes(normalized);
      } else {
        transformed.converted = !!convVal;
      }
    }

    // 5. Look up matching Session
    let session: Record<string, unknown> | null = null;
    const sessionId = transformed.session_id as string | undefined;
    const email = (transformed.visitor_email || transformed.prospect_email) as string | undefined;

    if (!isLinkedInLeadGen) {
      if (sessionId) {
        const { data } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('client_id', clientId)
          .maybeSingle();
        session = data;
      }

      if (!session && email) {
        const { data } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('prospect_email', email)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        session = data;
      }
    }

    let isNewSession = false;
    let finalSessionId = '';

    if (session) {
      // 6. Update existing session
      finalSessionId = session.id as string;
      const updates: Record<string, unknown> = {};

      if (transformed.prospect_name !== undefined) updates.prospect_name = transformed.prospect_name;
      if (transformed.prospect_email !== undefined) updates.prospect_email = transformed.prospect_email;
      if (transformed.company_name !== undefined) updates.company_name = transformed.company_name;
      if (transformed.job_title !== undefined) updates.job_title = transformed.job_title;
      if (transformed.assigned_rep !== undefined) updates.assigned_rep = transformed.assigned_rep;
      if (transformed.calendar_url !== undefined) updates.calendar_url = transformed.calendar_url;
      if (transformed.crm_deal_id !== undefined) updates.crm_deal_id = transformed.crm_deal_id;
      if (transformed.deal_stage !== undefined) updates.deal_stage = transformed.deal_stage;
      if (transformed.visitor_type !== undefined) updates.visitor_type = transformed.visitor_type;
      
      if (transformed.converted !== undefined) {
        updates.converted = transformed.converted;
        if (transformed.converted) {
          updates.converted_at = new Date().toISOString();
        }
      }

      const { error: updateErr } = await supabaseAdmin
        .from('sessions')
        .update(updates)
        .eq('id', finalSessionId)
        .eq('client_id', clientId);

      if (updateErr) {
        console.error('[Webhook Session Update Error] Failed to update session:', updateErr);
        return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 });
      }

      // Fetch the updated row to get visitor_token for cache invalidation
      const { data: updatedSession } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', finalSessionId)
        .single();
      if (updatedSession) {
        session = updatedSession;
      }
    } else if (email || isLinkedInLeadGen) {
      // 7. Create a new session if email matches and no session exists
      isNewSession = true;
      let newSid = generateSessionId();
      let attempts = 0;
      let isUnique = false;

      // Unique Sid generator loop
      while (!isUnique && attempts < 10) {
        const { data } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('id', newSid)
          .maybeSingle();

        if (!data) {
          isUnique = true;
        } else {
          newSid = generateSessionId();
          attempts++;
        }
      }

      finalSessionId = newSid;
      const visitorToken = crypto.randomUUID();

      const insertPayload: Record<string, unknown> = {
        id: finalSessionId,
        client_id: clientId,
        signal_type: isLinkedInLeadGen ? 'linkedin_lead_gen' : (transformed.signal_type || 'crm_webhook'),
        prospect_name: transformed.prospect_name || null,
        prospect_email: email || null,
        company_name: transformed.company_name || null,
        job_title: transformed.job_title || null,
        assigned_rep: transformed.assigned_rep || null,
        calendar_url: transformed.calendar_url || null,
        crm_deal_id: transformed.crm_deal_id || null,
        deal_stage: transformed.deal_stage || null,
        visitor_type: transformed.visitor_type || null,
        visitor_token: visitorToken,
        click_count: 0,
        converted: transformed.converted || false,
      };

      if (transformed.converted) {
        insertPayload.converted_at = new Date().toISOString();
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('sessions')
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        console.error('[Webhook Session Insert Error] Failed to create session:', insertErr);
        return NextResponse.json({ error: `Session creation failed: ${insertErr.message}` }, { status: 500 });
      }

      session = inserted;
    }

    // 8. Invalidate Upstash Redis cache for affected sessions
    if (session) {
      try {
        const sidCacheKey = `resolve:${clientId}:${session.id}`;
        await redis.del(sidCacheKey);

        if (session.visitor_token) {
          const tokenCacheKey = `resolve:${clientId}:${session.visitor_token}`;
          await redis.del(tokenCacheKey);
        }
      } catch (cacheErr) {
        console.error('[Webhook Invalidation Error] Failed to clear Redis cache:', cacheErr);
      }
    }

    // 9. Log Webhook Ingestion into analytics_events
    try {
      await supabaseAdmin.from('analytics_events').insert({
        client_id: clientId,
        session_id: session?.id || null,
        event_type: 'webhook',
        signal_type: isLinkedInLeadGen ? 'linkedin_lead_gen' : 'crm_webhook',
        metadata: {
          webhook_action: isNewSession ? 'create_session' : session ? 'update_session' : 'no_action',
          payload,
          transformed,
        },
      });
    } catch (logErr) {
      console.error('[Webhook Ingestion Error] Failed to log event:', logErr);
    }

    let trackedUrl = '';
    if (client) {
      let domain = client.domain || '';
      if (domain && !domain.startsWith('http://') && !domain.startsWith('https://')) {
        domain = 'https://' + domain;
      }
      const separator = domain.endsWith('/') ? '' : '/';
      trackedUrl = `${domain}${separator}?sid=${finalSessionId}`;
    }

    const responseObj: Record<string, unknown> = {
      success: true,
      message: isNewSession ? 'New session created successfully' : 'Session updated successfully',
      session_id: finalSessionId,
    };

    if (trackedUrl) {
      responseObj.tracked_url = trackedUrl;
      responseObj.churnaut_link = trackedUrl;
    }

    return NextResponse.json(responseObj);

  } catch (err) {
    console.error('[Webhook Route Exception] Unhandled error:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
