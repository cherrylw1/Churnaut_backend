import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { linksRequestSchema, readJson } from '@/lib/validation';
import { normalizeDestinationUrl } from '@/lib/url';
import { normalizeEmail } from '@/lib/email-normalization';

export const dynamic = 'force-dynamic';


// Helper to generate a cryptographically random, URL-safe session ID.
function generateSessionId(length: number = 6): string {
  return crypto.randomBytes(Math.ceil(length * 0.75) + 2).toString('base64url').slice(0, length);
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
    const pageRaw = url.searchParams.get('page') || '1';
    const limitRaw = url.searchParams.get('limit') || '50';
    if (!/^\d+$/.test(pageRaw) || !/^\d+$/.test(limitRaw)) return NextResponse.json({ error: 'page and limit must be positive integers' }, { status: 400 });
    const page = Number(pageRaw);
    const limit = Number(limitRaw);
    if (page < 1 || limit < 1 || limit > 200) return NextResponse.json({ error: 'page must be at least 1 and limit must be between 1 and 200' }, { status: 400 });
    const offset = (page - 1) * limit;

    const { data: sessions, error, count } = await supabaseAdmin
      .from('sessions')
      .select('*', { count: 'exact' })
      .eq('client_id', clientId)
      .or('session_kind.eq.tracked_link,session_kind.is.null')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[GET Links Error] Failed to fetch sessions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const [primaryDomainResult, clientResult] = await Promise.all([
      supabaseAdmin.from('client_domains').select('origin').eq('client_id', clientId).eq('is_primary', true).eq('active', true).maybeSingle(),
      supabaseAdmin.from('clients').select('domain').eq('id', clientId).maybeSingle(),
    ]);
    if (primaryDomainResult.error || clientResult.error) {
      console.error('[GET Links Error] Destination lookup failed:', primaryDomainResult.error || clientResult.error);
      return NextResponse.json({ error: 'Unable to resolve link destinations' }, { status: 500 });
    }
    const primaryDomain = primaryDomainResult.data;
    const client = clientResult.data;
    const hydratedSessions = (sessions || []).map((session) => {
      let destination = session.destination_url || primaryDomain?.origin || client?.domain || null;
      try { destination = destination ? normalizeDestinationUrl(destination) : null; } catch { destination = null; }
      return {
        ...session,
        destination_url: destination,
        tracked_url: destination ? buildTrackedUrl(destination, session.id) : null,
        legacy_destination_fallback: !session.destination_url,
      };
    });
    return NextResponse.json({
      sessions: hydratedSessions,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      totalPages: Math.ceil(total / limit),
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

    const parsedBody = await readJson(req, linksRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
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
    } = parsedBody.data;

    // 1. Generate unique 6-character session ID
    let sessionId = generateSessionId();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const { data, error: uniquenessError } = await supabaseAdmin
        .from('sessions')
        .select('id')
        .eq('id', sessionId)
        .maybeSingle();

      if (uniquenessError) {
        console.error('[POST Links Error] Session ID availability check failed:', uniquenessError);
        return NextResponse.json({ error: 'Unable to allocate a tracked link ID' }, { status: 503 });
      }

      if (!data) {
        isUnique = true;
      } else {
        sessionId = generateSessionId();
        attempts++;
      }
    }

    if (!isUnique) {
      return NextResponse.json({ error: 'Unable to allocate a unique tracked link ID' }, { status: 503 });
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
    const safeDestination = normalizeDestinationUrl(destination_url);
    const { error } = await supabaseAdmin
      .from('sessions')
      .insert({
        id: sessionId,
        client_id: clientId,
        expires_at: expiresAt,
        prospect_name: prospect_name || null,
        prospect_email: normalizeEmail(prospect_email),
        company_name: company_name || null,
        job_title: job_title || null,
        signal_type: signal_type || null,
        assigned_rep: assigned_rep || null,
        calendar_url: calendar_url || null,
        visitor_token: visitorToken,
        destination_url: safeDestination,
        session_kind: 'tracked_link',
        metadata: { legacy_destination: false },
        click_count: 0,
        converted: false,
      });

    if (error) {
      console.error('[POST Links Error] Failed to insert session:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Generate and return the tracked URL
    const trackedUrl = buildTrackedUrl(safeDestination, sessionId);
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
