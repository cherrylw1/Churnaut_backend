import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClientId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.json({ error: 'Pipedrive OAuth is not currently available; use the webhook integration.' }, { status: 501 });
}
