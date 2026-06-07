import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientPlan, planGate } from '@/lib/gate';

export const dynamic = 'force-dynamic';

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

export async function GET(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate user from session cookie
    const clientId = getClientId(req);
    if (!clientId) {
      // Redirect unauthenticated requests to login page
      return NextResponse.redirect(new URL('/login', req.url));
    }

    // 2. Fetch the client's snippet_key to pass as state parameter
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('snippet_key')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !client || !client.snippet_key) {
      console.error('[Zoho OAuth Redirect Error] Client lookup failed:', error);
      return NextResponse.json({ error: 'Client profile not found or invalid session' }, { status: 404 });
    }

    const zohoClientId = process.env.ZOHO_CLIENT_ID;
    if (!zohoClientId) {
      console.error('[Zoho OAuth Redirect Error] ZOHO_CLIENT_ID env variable is not set');
      return NextResponse.json({ error: 'Zoho integration is not configured on the server' }, { status: 500 });
    }

    // 3. Construct Zoho Authorization URL
    const redirectUri = 'https://app.churnaut.com/api/oauth/zoho/callback';
    const scope = 'ZohoCRM.modules.deals.READ ZohoCRM.modules.contacts.READ ZohoCRM.modules.leads.READ ZohoCRM.users.READ';
    
    const zohoAuthUrl = `https://accounts.zoho.com/oauth/v2/auth` +
      `?client_id=${encodeURIComponent(zohoClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(client.snippet_key)}`;

    // 4. Redirect to Zoho
    return NextResponse.redirect(zohoAuthUrl);
  } catch (err) {
    console.error('[Zoho OAuth Redirect Exception] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error during authorization redirect' }, { status: 500 });
  }
}
