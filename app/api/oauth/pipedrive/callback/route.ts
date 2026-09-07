import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/dashboard/integrations/crm?error=unsupported_provider', req.url));
}
