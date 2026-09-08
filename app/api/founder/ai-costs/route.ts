import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClientId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if ((await getAuthedClientId(req)) !== 'founder') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requested = req.nextUrl.searchParams.get('month');
  const now = new Date();
  const month = requested ? `${requested.slice(0, 7)}-01` : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabaseAdmin.rpc('get_ai_cost_dashboard', { month_start_input: month });
  if (error) return NextResponse.json({ error: 'AI cost dashboard unavailable' }, { status: 503 });
  const start = `${month}T00:00:00.000Z`; const endDate = new Date(`${month}T00:00:00.000Z`); endDate.setUTCMonth(endDate.getUTCMonth() + 1); const end = endDate.toISOString();
  const [unpriced, timeouts, fallbacks] = await Promise.all([
    supabaseAdmin.from('llm_logs').select('id', { count: 'exact', head: true }).eq('record_type', 'provider_attempt').eq('usage_source', 'pricing_missing').gte('created_at', start).lt('created_at', end),
    supabaseAdmin.from('llm_logs').select('id', { count: 'exact', head: true }).eq('record_type', 'provider_attempt').eq('status', 'timeout').gte('created_at', start).lt('created_at', end),
    supabaseAdmin.from('llm_logs').select('id', { count: 'exact', head: true }).eq('record_type', 'provider_attempt').eq('fallback_used', true).gte('created_at', start).lt('created_at', end),
  ]);
  return NextResponse.json({ ...(data || {}), reliability: { unpriced_attempts: unpriced.count || 0, timeout_attempts: timeouts.count || 0, fallback_attempts: fallbacks.count || 0 } });
}
