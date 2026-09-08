import { logWarn } from '@/lib/observability/logger'
import { canSendEmail } from '@/lib/environment'

/** Optional alert email. It sends only an aggregate alert summary, never event payloads. */
export async function notifyOpsAlert(alert: { key: string; severity: string; summary: string; active: boolean }) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.OPS_ALERT_EMAIL
  if (!apiKey || apiKey === 're_placeholder_key' || !to || !alert.active || !canSendEmail(to)) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.OPS_ALERT_FROM ?? 'Churnaut Ops <ops@churnaut.com>', to: [to], subject: `[Churnaut ${alert.severity}] ${alert.summary}`, text: `${alert.summary}\nAlert key: ${alert.key}\nThis alert is rate-limited and contains no customer data.` }),
    })
    if (!response.ok) { logWarn('[ops] alert notification rejected', { status: response.status }); return false }
    return true
  } catch { return false }
}
