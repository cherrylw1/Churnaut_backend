import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { ratelimit } from '@/lib/redis';
import { readJson, webhookPayloadSchema } from '@/lib/validation';
import { normalizeEmail } from '@/lib/email-normalization';
import { normalizeEmbedUrl } from '@/lib/url';

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
  return crypto.randomBytes(Math.ceil(length * 0.75) + 2).toString('base64url').slice(0, length);
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
      return NextResponse.json({ error: 'Missing webhook secret or Authorization Bearer token' }, { status: 401 });
    }

    // Webhook authentication must use the private webhook secret. The snippet_key
    // is intentionally embedded in public website JavaScript for browser tracking
    // and must never be accepted as an inbound integration credential.
    const { data: clientBySecret, error: secretErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('webhook_secret', key)
      .maybeSingle();

    const client = clientBySecret;
    const clientErr = secretErr;

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
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      return NextResponse.json({ error: 'Webhook payload is too large' }, { status: 413 });
    }
    const parsedPayload = await readJson(req, webhookPayloadSchema);
    if (!parsedPayload.ok) {
      return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
    }
    const payload = parsedPayload.data;

    // 3. Query Webhook Field Mappings
    const { data: mappings, error: mappingsErr } = await supabaseAdmin
      .from('webhook_mappings')
      .select('*')
      .eq('client_id', clientId);

    if (mappingsErr) {
      console.error('[Webhook Mapping Error] Mappings fetch failed:', mappingsErr);
      return NextResponse.json({ error: 'Webhook mapping service unavailable' }, { status: 503 });
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
    const rawVisitorEmail = transformed.visitor_email;
    const rawProspectEmail = transformed.prospect_email;
    const visitorEmail = normalizeEmail(rawVisitorEmail);
    const prospectEmail = normalizeEmail(rawProspectEmail);
    if ((rawVisitorEmail && !visitorEmail) || (rawProspectEmail && !prospectEmail)) {
      return NextResponse.json({ error: 'Invalid prospect email' }, { status: 422 });
    }
    const email = visitorEmail || prospectEmail;
    let calendarUrl: string | null | undefined;
    if (transformed.calendar_url !== undefined && transformed.calendar_url !== null && transformed.calendar_url !== '') {
      if (typeof transformed.calendar_url !== 'string') {
        return NextResponse.json({ error: 'Invalid calendar URL' }, { status: 422 });
      }
      try {
        calendarUrl = normalizeEmbedUrl(transformed.calendar_url);
      } catch {
        return NextResponse.json({ error: 'Calendar URL must be a valid HTTPS URL' }, { status: 422 });
      }
    } else if (transformed.calendar_url !== undefined) {
      calendarUrl = null;
    }

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
      if (transformed.prospect_email !== undefined) updates.prospect_email = prospectEmail;
      if (transformed.company_name !== undefined) updates.company_name = transformed.company_name;
      if (transformed.job_title !== undefined) updates.job_title = transformed.job_title;
      if (transformed.assigned_rep !== undefined) updates.assigned_rep = transformed.assigned_rep;
      if (calendarUrl !== undefined) updates.calendar_url = calendarUrl;
      if (transformed.crm_deal_id !== undefined) updates.crm_deal_id = transformed.crm_deal_id;
      if (transformed.deal_stage !== undefined) updates.deal_stage = transformed.deal_stage;
      if (transformed.visitor_type !== undefined) updates.visitor_type = transformed.visitor_type;
      
      if (transformed.converted !== undefined) {
        if (transformed.converted === false) {
          updates.converted = false;
          updates.converted_at = null;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from('sessions')
          .update(updates)
          .eq('id', finalSessionId)
          .eq('client_id', clientId);

        if (updateErr) {
          console.error('[Webhook Session Update Error] Failed to update session:', updateErr);
          return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 });
        }
      }

      if (transformed.converted === true) {
        const { data: transitioned, error: conversionError } = await supabaseAdmin.rpc('set_session_conversion', {
          client_id_input: clientId,
          session_id_input: finalSessionId,
          converted_input: true,
        });
        if (conversionError) {
          console.error('[Webhook Conversion Error] Atomic transition failed:', conversionError);
          return NextResponse.json({ error: 'Conversion update failed' }, { status: 500 });
        }
        void transitioned;
      }

      // Fetch the updated row to get visitor_token for cache invalidation
      const { data: updatedSession } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', finalSessionId)
        .eq('client_id', clientId)
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
        calendar_url: calendarUrl || null,
        crm_deal_id: transformed.crm_deal_id || null,
        deal_stage: transformed.deal_stage || null,
        visitor_type: transformed.visitor_type || null,
        visitor_token: visitorToken,
        click_count: 0,
        converted: transformed.converted || false,
        session_kind: 'webhook',
        metadata: { source: 'webhook' },
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
      if (transformed.converted === true) {
        const { error: conversionError } = await supabaseAdmin.rpc('set_session_conversion', {
          client_id_input: clientId,
          session_id_input: finalSessionId,
          converted_input: true,
        });
        if (conversionError) {
          console.error('[Webhook Conversion Error] Failed to record new-session conversion:', conversionError);
          return NextResponse.json({ error: 'Conversion event update failed' }, { status: 500 });
        }
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'No matching session found and no prospect email was provided' }, { status: 422 });
    }

    // 8. Log webhook receipt. Conversion events are created atomically by the
    // set_session_conversion RPC and deduplicated per session.
    const { error: webhookEventError } = await supabaseAdmin.from('analytics_events').insert({
        client_id: clientId,
        session_id: session.id,
        event_type: 'webhook_received',
        signal_type: isLinkedInLeadGen ? 'linkedin_lead_gen' : 'crm_webhook',
        metadata: {
          schema_version: 2,
          webhook_action: isNewSession ? 'create_session' : 'update_session',
          payload,
          transformed,
        },
      });
    if (webhookEventError) {
      console.error('[Webhook Ingestion Error] Failed to log webhook event:', webhookEventError);
      return NextResponse.json({ error: 'Webhook event logging failed' }, { status: 503 });
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
