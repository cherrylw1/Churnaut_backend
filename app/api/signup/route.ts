import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { userId, companyName } = await req.json();

    if (!userId || !companyName) {
      return NextResponse.json({ error: 'Missing userId or companyName' }, { status: 400 });
    }

    const snippetKey = crypto.randomUUID();
    const domainFallback = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

    // Insert the new client profile using the service role client
    const { error } = await supabaseAdmin
      .from('clients')
      .insert({
        id: userId, // Match Auth User ID for RLS
        company_name: companyName,
        domain: domainFallback,
        snippet_key: snippetKey,
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
