import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { ratelimit } from '@/lib/redis';
import { readJson, signupRequestSchema } from '@/lib/validation';

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
    const parsedBody = await readJson(req, signupRequestSchema);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }
    const { userId, companyName, email } = parsedBody.data;

    let authedUserId = await getAuthedClientId(req);
    if (!authedUserId) {
      // Supabase may require email confirmation and therefore return no
      // session from signUp. Validate the just-created user and metadata
      // before provisioning the profile in that case.
      const { data: adminUser, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      const metadataCompany = adminUser?.user?.user_metadata?.company_name;
      if (
        adminUserError ||
        !adminUser?.user ||
        !email ||
        adminUser.user.email?.toLowerCase() !== email.toLowerCase() ||
        metadataCompany !== companyName
      ) {
        return NextResponse.json({ error: 'Email confirmation is required before workspace setup.' }, { status: 403 });
      }
      authedUserId = adminUser.user.id;
    }
    if (authedUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden: Authenticated user ID mismatch' }, { status: 403 });
    }

    const snippetKey = crypto.randomUUID();
    const webhookSecret = crypto.randomUUID();
    const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) || 'workspace';
    const domainFallback = `${companySlug}-${userId.slice(0, 8)}.com`;

    // The database auth-user trigger provisions this row in the same transaction
    // as sign-up. Keep this idempotent write as a compatibility fallback for
    // environments where the trigger has not yet been installed.
    const { error } = await supabaseAdmin
      .from('clients')
      .upsert({
        id: userId, // Match Auth User ID for RLS
        company_name: companyName,
        domain: domainFallback,
        snippet_key: snippetKey,
        webhook_secret: webhookSecret,
        email: email ? email.toLowerCase() : null,
        plan: 'starter',
        active: true,
      }, { onConflict: 'id', ignoreDuplicates: true });

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
