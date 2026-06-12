import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateText } from '@/lib/llm/complete'
import { sendWeeklyDigest } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all active Growth+ clients with email
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, email, company_name, plan')
    .eq('active', true)
    .in('plan', ['growth', 'pro'])

  if (error || !clients) {
    console.error('[scout-digest cron] Failed to fetch clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekStartStr = sevenDaysAgo.split('T')[0]

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const client of clients) {
    if (!client.email) { skipped++; continue }

    try {
      // Skip if digest already sent this week
      const { data: existing } = await supabaseAdmin
        .from('weekly_digests')
        .select('id')
        .eq('client_id', client.id)
        .eq('week_start', weekStartStr)
        .maybeSingle()

      if (existing) { skipped++; continue }

      // Fetch 7-day metrics
      const [sessionsRes, eventsRes, snapRes] = await Promise.all([
        supabaseAdmin
          .from('sessions')
          .select('signal_type, converted, assigned_rep')
          .eq('client_id', client.id)
          .gte('created_at', sevenDaysAgo),
        supabaseAdmin
          .from('analytics_events')
          .select('rule_id')
          .eq('client_id', client.id)
          .eq('event_type', 'rule_triggered')
          .gte('created_at', sevenDaysAgo),
        supabaseAdmin
          .from('pipeline_snapshots')
          .select('pressure_score, red_count, amber_count, green_count, total_deals')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const sessions = sessionsRes.data || []
      const events = eventsRes.data || []
      const snap = snapRes.data

      const totalLinks = sessions.length
      const totalClicks = sessions.filter(s => s.signal_type).length
      const totalConversions = sessions.filter(s => s.converted).length
      const triggerCount = events.length

      // Top signal by conversion
      const signalMap: Record<string, { total: number; converted: number }> = {}
      for (const s of sessions) {
        const sig = s.signal_type || 'any'
        if (!signalMap[sig]) signalMap[sig] = { total: 0, converted: 0 }
        signalMap[sig].total++
        if (s.converted) signalMap[sig].converted++
      }
      const topSignal = Object.entries(signalMap)
        .sort((a, b) => (b[1].converted / Math.max(1, b[1].total)) - (a[1].converted / Math.max(1, a[1].total)))[0]

      // Best rep
      const repMap: Record<string, number> = {}
      for (const s of sessions) {
        if (s.assigned_rep && s.converted) repMap[s.assigned_rep] = (repMap[s.assigned_rep] || 0) + 1
      }
      const bestRep = Object.entries(repMap).sort((a, b) => b[1] - a[1])[0]

      const pipelineLine = snap && snap.total_deals > 0
        ? `Pipeline: ${snap.total_deals} open deals, pressure score ${snap.pressure_score}/100. ${snap.red_count} RED, ${snap.amber_count} AMBER, ${snap.green_count} GREEN.`
        : 'No Scout pipeline data for this period.'

      const prompt = `You are generating a weekly performance digest for a B2B SaaS customer using Churnaut.

Weekly data:
- Tracked links active: ${totalLinks}
- Prospect clicks: ${totalClicks}
- Conversions: ${totalConversions}
- Personalization rule fires: ${triggerCount}
- Top signal: ${topSignal ? `${topSignal[0]} (${topSignal[1].converted}/${topSignal[1].total} conversions)` : 'none'}
- Best rep: ${bestRep ? `${bestRep[0]} with ${bestRep[1]} conversions` : 'none this week'}
- ${pipelineLine}

Return ONLY a JSON object (no markdown) with exactly these keys:
{
  "summary": "2-3 sentence pipeline narrative. Be specific and direct.",
  "top_signal": "1 sentence on best performing signal and why it matters.",
  "rep_spotlight": "1 sentence on rep performance or 'No rep conversion data this week.'",
  "recommendation": "1 concrete action the team should take this week based on the data."
}`

      const raw = await generateText(prompt, { temperature: 0.4, maxTokens: 600 })

      let digestJson: { summary: string; top_signal: string; rep_spotlight: string; recommendation: string }
      try {
        const cleaned = raw.replace(/```json|```/g, '').trim()
        digestJson = JSON.parse(cleaned)
      } catch {
        console.error(`[scout-digest cron] JSON parse failed for client ${client.id}`)
        errors.push(client.id)
        continue
      }

      // Store in weekly_digests
      await supabaseAdmin.from('weekly_digests').insert({
        client_id: client.id,
        week_start: weekStartStr,
        summary: digestJson.summary,
        top_signal: digestJson.top_signal,
        rep_spotlight: digestJson.rep_spotlight,
        recommendation: digestJson.recommendation,
      })

      // Send email
      await sendWeeklyDigest(client.email, digestJson)
      sent++

    } catch (e) {
      console.error(`[scout-digest cron] Error for client ${client.id}:`, e)
      errors.push(client.id)
    }
  }

  return NextResponse.json({ success: true, sent, skipped, errors, total: clients.length })
}
