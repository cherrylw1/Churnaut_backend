import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendNudgeEmail } from '@/lib/email/resend';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import { nudgeRequestSchema, readJson } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate Client
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const parsedBody = await readJson(req, nudgeRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { deal_id, message } = parsedBody.data;

    // Never trust the browser to choose the email recipient. Resolve the deal
    // and representative from this tenant's latest CRM-backed score record.
    const { data: scoreData, error: scoreError } = await supabaseAdmin
      .from('deal_scores')
      .select('deal_name, rep_email, rep_name, draft_email, next_action')
      .eq('client_id', clientId)
      .eq('deal_id', deal_id)
      .maybeSingle();
    if (scoreError) {
      logError('[Scout Nudge POST] Error resolving trusted recipient:', scoreError);
      return NextResponse.json({ error: 'Unable to verify the deal representative' }, { status: 500 });
    }
    if (!scoreData) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    const repEmail = scoreData.rep_email?.trim();
    if (!repEmail) {
      return NextResponse.json({ error: 'No verified CRM representative email is available for this deal' }, { status: 409 });
    }
    const dealName = scoreData.deal_name || 'Unnamed Deal';
    const repName = scoreData.rep_name || '';

    // 3. Insert nudge record in scout_nudges table
    const { data, error } = await supabaseAdmin
      .from('scout_nudges')
      .insert({
        client_id: clientId,
        deal_id,
        deal_name: dealName,
        rep_email: repEmail,
        rep_name: repName,
        message: message || '',
        sent: false,
        sent_at: null,
      })
      .select()
      .single();

    if (error) {
      logError('[Scout Nudge POST] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. Resolve the recommended content, then deliver before marking sent.
    try {
      const draftEmail = scoreData.draft_email || null;
      const nextAction = scoreData.next_action || 'No next action specified';
      const emailResult = await sendNudgeEmail(repEmail, dealName, message || draftEmail, nextAction);
      if (!emailResult.success) throw new Error('Nudge email delivery failed');

      const { data: sentNudge, error: sentError } = await supabaseAdmin
        .from('scout_nudges')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', data.id)
        .eq('client_id', clientId)
        .select()
        .single();
      if (sentError) throw sentError;
      return NextResponse.json({ success: true, nudge: sentNudge });
    } catch (emailErr) {
      logError('[Scout Nudge POST] Exception during email dispatch:', emailErr);
      return NextResponse.json({ error: 'Nudge email delivery failed' }, { status: 502 });
    }

  } catch (error) {
    logError('[Scout Nudge POST Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
