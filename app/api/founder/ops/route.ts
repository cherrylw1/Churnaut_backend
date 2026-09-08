import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClientId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  if ((await getAuthedClientId(req)) !== 'founder') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [{ data: alerts }, { data: heartbeats }, { count: deadJobs }, { count: queuedJobs }, { count: unhealthyCrm }, { count: pastDue }] = await Promise.all([
    supabaseAdmin.from('ops_alert_state').select('alert_key,component,severity,status,summary,first_seen_at,last_seen_at,occurrence_count,resolved_at').order('last_seen_at', { ascending: false }).limit(100),
    supabaseAdmin.from('service_heartbeats').select('service_name,last_attempt_at,last_success_at,status,updated_at'),
    supabaseAdmin.from('background_jobs').select('id', { count: 'exact', head: true }).eq('status', 'dead'),
    supabaseAdmin.from('background_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued','retry']),
    supabaseAdmin.from('crm_tokens').select('id', { count: 'exact', head: true }).eq('connection_status', 'unhealthy'),
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('plan_status', 'past_due'),
  ])
  return NextResponse.json({ alerts: alerts ?? [], heartbeats: heartbeats ?? [], queue: { dead_jobs: deadJobs ?? 0, queued_jobs: queuedJobs ?? 0 }, unhealthy_crm: unhealthyCrm ?? 0, past_due_payments: pastDue ?? 0 })
}
