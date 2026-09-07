import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { linksRequestSchema } from '@/lib/validation';
import { normalizeDestinationUrl } from '@/lib/url';
import { normalizeEmail } from '@/lib/email-normalization';
import { canAccessFeature, type Plan } from '@/lib/plans';

const bulkSchema = z.object({ rows: z.array(linksRequestSchema).min(1).max(500) }).strict();

function trackedUrl(destination: string, id: string) {
  const url = new URL(destination);
  url.searchParams.set('sid', id);
  return url.toString();
}

export async function POST(req: NextRequest) {
  const clientId = await getAuthedClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: client, error: clientError } = await supabaseAdmin.from('clients').select('plan').eq('id', clientId).maybeSingle();
  if (clientError) return NextResponse.json({ error: 'Unable to verify account plan' }, { status: 503 });
  if (!client) return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
  const plan: Plan | null = client.plan === 'starter' || client.plan === 'growth' || client.plan === 'pro' ? client.plan : null;
  if (!canAccessFeature(plan, 'bulk_csv')) return NextResponse.json({ error: 'upgrade_required', required_plan: 'growth' }, { status: 403 });
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > 5_000_000) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }); }
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, { status: 400 });

  const results: Array<Record<string, unknown>> = [];
  for (const row of parsed.data.rows) {
    const id = crypto.randomBytes(9).toString('base64url').slice(0, 10);
    const destination = normalizeDestinationUrl(row.destination_url);
    const expiresAt = row.expires_in_days ? new Date(Date.now() + row.expires_in_days * 86400000).toISOString() : null;
    const { error } = await supabaseAdmin.from('sessions').insert({
      id, client_id: clientId, destination_url: destination, session_kind: 'tracked_link',
      prospect_name: row.prospect_name || null, prospect_email: normalizeEmail(row.prospect_email),
      company_name: row.company_name || null, job_title: row.job_title || null,
      signal_type: row.signal_type || null, assigned_rep: row.assigned_rep || null,
      calendar_url: row.calendar_url || null, expires_at: expiresAt, visitor_token: crypto.randomUUID(),
      metadata: { legacy_destination: false }, click_count: 0, converted: false,
    });
    results.push({ ...row, tracked_url: error ? '' : trackedUrl(destination, id), session_id: error ? '' : id, status: error ? `Error: ${error.message}` : 'Success' });
  }
  return NextResponse.json({ results });
}
