import { NextRequest, NextResponse } from 'next/server';
import { ipAddress } from '@vercel/functions';
import { ratelimit } from '@/lib/redis';
import { readJson, authFailureRequestSchema } from '@/lib/validation';
import { recordOpsEvent } from '@/lib/monitoring/events';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = ipAddress(req) || forwarded || req.headers.get('x-real-ip') || 'unknown';
  try {
    const limited = await ratelimit.limit(`ops-auth-failure:${ip}`);
    if (!limited.success) return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    // Telemetry must never block login UX when Redis is unavailable.
  }
  const parsed = await readJson(req, authFailureRequestSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await recordOpsEvent({
    component: 'auth',
    eventCode: 'auth_failure',
    severity: 'warning',
    metadata: { failure_category: parsed.data.category, auth_method: 'password' },
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
