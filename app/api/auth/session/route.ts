import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authSessionRequestSchema, readJson } from '@/lib/validation';

const SESSION_COOKIE = 'churnaut-session';

export async function POST(req: NextRequest) {
  const parsed = await readJson(req, authSessionRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(parsed.data.access_token);
  if (error || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const response = NextResponse.json({ success: true });
  const maxAge = parsed.data.expires_at
    ? Math.max(60, parsed.data.expires_at - Math.floor(Date.now() / 1000))
    : 60 * 60 * 24 * 7;
  response.cookies.set(SESSION_COOKIE, JSON.stringify({
    access_token: parsed.data.access_token,
    expires_at: parsed.data.expires_at,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
