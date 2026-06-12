import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';

// Helper to generate a random 6-character session ID
function generateSessionId(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to append sid correctly to any destination URL
function buildTrackedUrl(destinationUrl: string, sid: string): string {
  try {
    const url = new URL(destinationUrl);
    url.searchParams.set('sid', sid);
    return url.toString();
  } catch {
    const separator = destinationUrl.includes('?') ? '&' : '?';
    return `${destinationUrl}${separator}sid=${sid}`;
  }
}

// GET handler: Fetch all links/sessions for the logged-in client
export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const { data: sessions, error, count } = await supabaseAdmin
      .from('sessions')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[GET Links Error] Failed to fetch sessions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    return NextResponse.json({
      sessions: sessions || [],
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    console.error('[GET Links Exception] Unhandled exception:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST handler: Create a new tracked link/session
export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      prospect_name,
      prospect_email,
      company_name,
      job_title,
      signal_type,
      assigned_rep,
      calendar_url,
      destination_url,
      expires_in_days,
    } = body;

    if (!destination_url) {
      return NextResponse.json({ error: 'destination_url is required' }, { status: 400 });
    }

    // 1. Generate unique 6-character session ID
    let sessionId = generateSessionId();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const { data } = await supabaseAdmin
        .from('sessions')
        .select('id')
        .eq('id', sessionId)
        .maybeSingle();

      if (!data) {
        isUnique = true;
      } else {
        sessionId = generateSessionId();
        attempts++;
      }
    }

    // 2. Compute expiration date
    let expiresAt: string | null = null;
    if (expires_in_days) {
      const days = parseInt(expires_in_days.toString(), 10);
      if (!isNaN(days) && days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        expiresAt = d.toISOString();
      }
    }

    // 3. Generate unique visitor token
    const visitorToken = crypto.randomUUID();

    // 4. Insert row into sessions table
    const { error } = await supabaseAdmin
      .from('sessions')
      .insert({
        id: sessionId,
        client_id: clientId,
        expires_at: expiresAt,
        prospect_name: prospect_name || null,
        prospect_email: prospect_email || null,
        company_name: company_name || null,
        job_title: job_title || null,
        signal_type: signal_type || null,
        assigned_rep: assigned_rep || null,
        calendar_url: calendar_url || null,
        visitor_token: visitorToken,
        click_count: 0,
        converted: false,
      });

    if (error) {
      console.error('[POST Links Error] Failed to insert session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Generate and return the tracked URL
    const trackedUrl = buildTrackedUrl(destination_url, sessionId);
    return NextResponse.json({
      success: true,
      sessionId,
      trackedUrl,
      visitorToken,
    });

  } catch (err) {
    console.error('[POST Links Exception] Unhandled exception:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
