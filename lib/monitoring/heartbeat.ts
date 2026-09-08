import { supabaseAdmin } from '@/lib/supabase'
export async function touchHeartbeat(serviceName: string, status: 'ok' | 'failed' | 'paused', metadata: Record<string, unknown> = {}) {
  try { await supabaseAdmin.rpc('touch_service_heartbeat', { service_name_input: serviceName, status_input: status, metadata_input: metadata }) } catch { /* monitoring must not break the job */ }
}
export async function touchHeartbeatAttempt(serviceName: string, metadata: Record<string, unknown> = {}) {
  try { await supabaseAdmin.rpc('touch_service_attempt', { service_name_input: serviceName, metadata_input: metadata }) } catch { /* monitoring must not break the job */ }
}
