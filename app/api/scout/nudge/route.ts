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
    const { deal_id, deal_name, rep_email, rep_name, message } = parsedBody.data;
    if (!rep_email) {
      return NextResponse.json({ error: 'A verified representative email address is required' }, { status: 400 });
    }

    // 3. Insert nudge record in scout_nudges table
    const { data, error } = await supabaseAdmin
      .from('scout_nudges')
      .insert({
        client_id: clientId,
        deal_id: deal_id || null,
        deal_name: deal_name || null,
        rep_email: rep_email || '',
        rep_name: rep_name || '',
        message: message || '',
        sent: false,
        sent_at: null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Scout Nudge POST] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. Resolve the recommended content, then deliver before marking sent.
    try {
      let draftEmail: string | null = null;
      let nextAction = 'No next action specified';
      if (deal_id) {
        const { data: scoreData, error: scoreError } = await supabaseAdmin
          .from('deal_scores')
          .select('draft_email, next_action')
          .eq('client_id', clientId)
          .eq('deal_id', deal_id)
          .maybeSingle();

        if (scoreError) {
          console.error('[Scout Nudge POST] Error fetching deal_scores for email nudge:', scoreError);
        } else if (scoreData) {
          draftEmail = scoreData.draft_email || null;
          nextAction = scoreData.next_action || nextAction;
        }
      }
      const emailResult = await sendNudgeEmail(rep_email, deal_name || 'Unnamed Deal', message || draftEmail, nextAction);
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
      console.error('[Scout Nudge POST] Exception during email dispatch:', emailErr);
      return NextResponse.json({ error: 'Nudge email delivery failed' }, { status: 502 });
    }

  } catch (error) {
    console.error('[Scout Nudge POST Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
