import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { ratelimit } from '@/lib/redis';
import { webhookPayloadSchema } from '@/lib/validation';
import { authenticateWebhookRequest } from '@/lib/webhook-auth';
import { normalizeEmail } from '@/lib/email-normalization';
import { normalizeEmbedUrl } from '@/lib/url';
import { recordOpsEvent } from '@/lib/monitoring/events';

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
  let observedClientId: string | undefined;
  try {
    // Read the exact bytes once so signed requests can be verified before JSON
    // parsing or re-serialization. Credentials are never logged.
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      return NextResponse.json({ error: 'Webhook payload is too large' }, { status: 413 });
    }
    const rawBody = await req.text();
    if (rawBody.length > 1_000_000) return NextResponse.json({ error: 'Webhook payload is too large' }, { status: 413 });

    const authResult = await authenticateWebhookRequest(req, rawBody);
    // Preserve the existing 503 contract: "Webhook authentication service unavailable".
    if (!authResult.ok) {
      await recordOpsEvent({ component: 'webhook', eventCode: 'webhook_rejected', severity: 'warning', metadata: { failure_category: 'authentication_rejected' } });
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { client, method: webhookAuthMethod } = authResult;

    const clientId = client.id;
    observedClientId = clientId;

    // Rate Limiting by client ID
    try {
      const { success } = await ratelimit.limit(clientId);
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    } catch (rlError) {
      logError('[RateLimit Error] Failed to enforce rate limiting on webhook:', rlError);
    }

    // 2. Parse Incoming Payload after authentication.
    let payloadValue: unknown;
    try {
      payloadValue = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsedPayload = webhookPayloadSchema.safeParse(payloadValue);
    if (!parsedPayload.success) return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    const payload = parsedPayload.data;

    // 3. Query Webhook Field Mappings
    const { data: mappings, error: mappingsErr } = await supabaseAdmin
      .from('webhook_mappings')
      .select('*')
      .eq('client_id', clientId);

    if (mappingsErr) {
      logError('[Webhook Mapping Error] Mappings fetch failed:', mappingsErr);
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
        const { data, error: sessionLookupError } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('client_id', clientId)
          .maybeSingle();
        if (sessionLookupError) {
          logError('[Webhook Session Lookup Error] ID lookup failed:', sessionLookupError);
          return NextResponse.json({ error: 'Session lookup unavailable' }, { status: 503 });
        }
        session = data;
      }

      if (!session && email) {
        const { data, error: emailLookupError } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('prospect_email', email)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (emailLookupError) {
          logError('[Webhook Session Lookup Error] Email lookup failed:', emailLookupError);
          return NextResponse.json({ error: 'Session lookup unavailable' }, { status: 503 });
        }
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
          logError('[Webhook Session Update Error] Failed to update session:', updateErr);
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
          logError('[Webhook Conversion Error] Atomic transition failed:', conversionError);
          return NextResponse.json({ error: 'Conversion update failed' }, { status: 500 });
        }
        void transitioned;
      }

      // Fetch the updated row to get visitor_token for cache invalidation
      const { data: updatedSession, error: updatedSessionError } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', finalSessionId)
        .eq('client_id', clientId)
        .single();
      if (updatedSessionError || !updatedSession) {
        logError('[Webhook Session Update Error] Updated row could not be reloaded:', updatedSessionError);
        return NextResponse.json({ error: 'Unable to verify the updated session' }, { status: 500 });
      }
      session = updatedSession;
    } else if (email || isLinkedInLeadGen) {
      // 7. Create a new session if email matches and no session exists
      isNewSession = true;
      let newSid = generateSessionId();
      let attempts = 0;
      let isUnique = false;

      // Unique Sid generator loop
      while (!isUnique && attempts < 10) {
        const { data, error: uniquenessError } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('id', newSid)
          .maybeSingle();

        if (uniquenessError) {
          logError('[Webhook Session Insert Error] Session ID availability check failed:', uniquenessError);
          return NextResponse.json({ error: 'Unable to allocate a webhook session ID' }, { status: 503 });
        }

        if (!data) {
          isUnique = true;
        } else {
          newSid = generateSessionId();
          attempts++;
        }
      }

      if (!isUnique) {
        return NextResponse.json({ error: 'Unable to allocate a unique webhook session ID' }, { status: 503 });
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
        logError('[Webhook Session Insert Error] Failed to create session:', insertErr);
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
          logError('[Webhook Conversion Error] Failed to record new-session conversion:', conversionError);
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
          webhook_auth_method: webhookAuthMethod,
          payload_key_count: Object.keys(payload).length,
          transformed_field_count: Object.keys(transformed).length,
          result_category: isNewSession ? 'created' : 'updated',
        },
      });
    if (webhookEventError) {
      logError('[Webhook Ingestion Error] Failed to log webhook event:', webhookEventError);
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

    await recordOpsEvent({ component: 'webhook', eventCode: 'webhook_processed', severity: 'info', clientId, metadata: { status: 'processed', auth_method: webhookAuthMethod } });
    return NextResponse.json(responseObj);

  } catch (err) {
    logError('[Webhook Route Exception] Unhandled error:', err);
    await recordOpsEvent({ component: 'webhook', eventCode: 'webhook_failed', severity: 'error', clientId: observedClientId, metadata: { failure_category: 'processing_error' } });
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
