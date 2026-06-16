import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { ratelimit } from '@/lib/redis';

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting by IP
    const ip = req.headers.get('x-forwarded-for') || req.ip || '127.0.0.1';
    try {
      const { success } = await ratelimit.limit(`signup:${ip}`);
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    } catch (rlError) {
      console.error('[RateLimit Error] Failed to enforce rate limiting on signup:', rlError);
    }

    // 2. Authenticate Client
    const authedUserId = await getAuthedClientId(req);
    const body = await req.json();
    const { userId, companyName, email } = body;

    if (!userId || !companyName) {
      return NextResponse.json({ error: 'Missing userId or companyName' }, { status: 400 });
    }

    if (!authedUserId || authedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden: Authenticated user ID mismatch' }, { status: 403 });
    }

    const snippetKey = crypto.randomUUID();
    const webhookSecret = crypto.randomUUID();
    const domainFallback = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

    // Insert the new client profile using the service role client
    const { error } = await supabaseAdmin
      .from('clients')
      .insert({
        id: userId, // Match Auth User ID for RLS
        company_name: companyName,
        domain: domainFallback,
        snippet_key: snippetKey,
        webhook_secret: webhookSecret,
        email: email ? email.toLowerCase() : null,
        plan: 'starter',
        active: true,
      });

    if (error) {
      console.error('[DB Signup Error] Failed to insert client profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Server error occurred';
    console.error('[Signup Exception] Unhandled signup API error:', err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
