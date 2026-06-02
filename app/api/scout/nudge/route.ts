import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendNudgeEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

// Helper to extract authenticated client_id from cookie session
function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request payload
    const { deal_id, deal_name, rep_email, rep_name, message } = await req.json();

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
        sent: true,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Scout Nudge POST] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. Query deal_scores for draft_email and next_action
    if (deal_id) {
      try {
        const { data: scoreData, error: scoreError } = await supabaseAdmin
          .from('deal_scores')
          .select('draft_email, next_action')
          .eq('client_id', clientId)
          .eq('deal_id', deal_id)
          .maybeSingle();

        if (scoreError) {
          console.error('[Scout Nudge POST] Error fetching deal_scores for email nudge:', scoreError);
        } else {
          const draftEmail = scoreData?.draft_email || null;
          const nextAction = scoreData?.next_action || 'No next action specified';

          // 5. Call sendNudgeEmail() with rep_email as the TO address
          if (rep_email) {
            console.log(`[Scout Nudge POST] Sending nudge email to: ${rep_email} for deal: ${deal_name}`);
            await sendNudgeEmail(rep_email, deal_name || 'Unnamed Deal', draftEmail, nextAction);
          } else {
            console.warn('[Scout Nudge POST] Skipping email nudge: rep_email is missing');
          }
        }
      } catch (emailErr) {
        console.error('[Scout Nudge POST] Exception during email dispatch:', emailErr);
      }
    }

    return NextResponse.json({ success: true, nudge: data });

  } catch (error) {
    console.error('[Scout Nudge POST Exception] Unhandled error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
