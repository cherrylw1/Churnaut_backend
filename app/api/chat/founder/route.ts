import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClientId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { embed, DEFAULT_MODEL } from '@/lib/llm/complete'

export const dynamic = 'force-dynamic'

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions'

const SYSTEM_PROMPT = `You are an expert AI assistant for Sharath, the solo founder of Churnaut — a B2B RevOps SaaS product.

You have complete knowledge of the Churnaut codebase, product, and architecture.

You have three special capabilities beyond answering questions:

1. HEALTH REPORT (triggered by LIVE_HEALTH_DATA in the message):
Analyze the health data provided and give a clear, prioritized list of what needs attention. Be specific — name exact issues, not generic advice. Format as: CRITICAL / WARNING / OK sections. Keep it under 10 lines total.

2. BUILD PROMPT GENERATOR (triggered by BUILD_PROMPT_REQUEST in the message):
Generate a precise, ready-to-paste Antigravity build prompt. Format it exactly like this:
- Start with a one-line summary of what we're building
- List exact files to modify with specific changes
- Include a VERIFY AND DEPLOY step at the end
- Use exact file paths, function names, and variable names from the codebase
- Never use placeholders — always use real names from the code

3. BUG DIAGNOSIS (triggered by BUG_REPORT in the message):
Identify the exact file, function, and line causing the error. Give the specific fix — the exact code change needed. Format as: CAUSE / FILE / FIX sections.

For all other questions, answer as a senior developer who built every line of Churnaut.
Reference exact file names, function names, and variable names.
Never make up code that doesn't exist.`


async function embedQuery(text: string): Promise<number[]> {
  return embed(text, { type: 'query' })
}

function isHealthCheckRequest(message: string): boolean {
  return /what.*(broke|broken|failing|wrong|issue|problem)|anything.*failing|prod.*issue|recent.*error|health.*check|status.*check/i.test(message)
}

function isBuildPromptRequest(message: string): boolean {
  return /write.*prompt|build.*prompt|create.*prompt|generate.*prompt|antigravity.*prompt|prompt.*for|how.*build|how.*add|how.*implement|how.*create.*feature/i.test(message)
}

function isBugReport(message: string): boolean {
  return /error|exception|undefined|null|failed|crash|TypeError|cannot read|is not a function|404|500|ENOENT|stack trace/i.test(message)
}

async function fetchHealthData() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const [anomalies, recentEvents, deadSessions, webhookSessions, scoutNudges] = await Promise.all([
    // Unread anomaly alerts
    supabaseAdmin.from('anomaly_alerts').select('alert_text, severity, created_at').eq('read', false).order('created_at', { ascending: false }).limit(5),

    // Analytics events in last 24h
    supabaseAdmin.from('analytics_events').select('event_type, signal_type, created_at').gte('created_at', since24h).order('created_at', { ascending: false }).limit(50),

    // Sessions created 48h ago with zero clicks — links sent but never opened
    supabaseAdmin.from('sessions').select('id, prospect_name, prospect_email, signal_type, created_at').lte('created_at', since48h).eq('click_count', 0).limit(10),

    // Sessions created via webhook in last 24h
    supabaseAdmin.from('sessions').select('id, prospect_name, signal_type, created_at').gte('created_at', since24h).eq('signal_type', 'webhook').limit(10),

    // RED deals with no nudge sent
    supabaseAdmin.from('deal_scores').select('deal_name, score, primary_risk, scored_at').eq('score', 'RED').limit(5),
  ])

  const eventTypes = recentEvents.data?.reduce((acc: Record<string, number>, e: { event_type: string }) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1
    return acc
  }, {}) || {}

  return {
    unreadAlerts: anomalies.data || [],
    eventSummary: eventTypes,
    totalEvents24h: recentEvents.data?.length || 0,
    deadSessions: deadSessions.data?.length || 0,
    redDeals: scoutNudges.data || [],
    webhookSessions24h: webhookSessions.data?.length || 0,
  }
}

async function searchCodebase(query: string, matchCount = 8) {
  try {
    const embedding = await embedQuery(query)
    const { data } = await supabaseAdmin.rpc('match_code_chunks', {
      query_embedding: JSON.stringify(embedding),
      match_count: matchCount,
      match_threshold: 0.35,
    })
    return data || []
  } catch (err) {
    console.error('[Founder Chat] Codebase search failed, bypassing RAG context:', err)
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req)
    if (!clientId || clientId !== process.env.FOUNDER_CLIENT_ID) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await req.json()
    const { message, history = [] } = body

    if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    let enrichedMessage = message
    let chunks: Array<{ file_path: string; content: string; similarity: number }> = []

    // Health check
    if (isHealthCheckRequest(message)) {
      const health = await fetchHealthData()
      enrichedMessage += `\n\nLIVE_HEALTH_DATA: ${JSON.stringify({
        unread_alerts: health.unreadAlerts.map((a: { alert_text: string; severity: string }) => `[${a.severity}] ${a.alert_text}`),
        events_last_24h: health.totalEvents24h,
        event_breakdown: health.eventSummary,
        dead_sessions_48h: health.deadSessions,
        red_deals: health.redDeals.map((d: { deal_name: string; primary_risk: string }) => `${d.deal_name}: ${d.primary_risk}`),
        webhook_sessions_24h: health.webhookSessions24h,
      })}`
      // Also search codebase for context
      chunks = await searchCodebase(message)
    }

    // Build prompt generator
    else if (isBuildPromptRequest(message)) {
      chunks = await searchCodebase(message, 12)
      const fileList = chunks.map(c => c.file_path).filter((v, i, a) => a.indexOf(v) === i).join(', ')
      enrichedMessage += `\n\nBUILD_PROMPT_REQUEST: Generate a precise Antigravity build prompt. Relevant files already identified: ${fileList}. Use exact names from the code chunks provided. Format as a ready-to-paste prompt.`
    }

    // Bug diagnosis
    else if (isBugReport(message)) {
      chunks = await searchCodebase(message, 10)
      enrichedMessage += `\n\nBUG_REPORT: Analyze this error and identify the exact cause, file, and fix based on the codebase chunks provided.`
    }

    // Default — regular codebase question
    else {
      chunks = await searchCodebase(message)
    }

    const context = chunks.length > 0
      ? chunks.map(c => `--- ${c.file_path} (${(c.similarity * 100).toFixed(0)}% match) ---\n${c.content}`).join('\n\n')
      : 'No specific code chunks found.'

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nRELEVANT CODE FROM CODEBASE:\n${context}` },
      ...history.slice(-6).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: enrichedMessage },
    ]

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        max_tokens: 1500,
        temperature: 0.3,
        top_p: 0.9,
        chat_template_kwargs: { thinking: false },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[Founder Chat] Together AI error:', err)
      return NextResponse.json({ error: 'AI inference failed' }, { status: 500 })
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content || 'No response generated.'
    const sourcesUsed = chunks.map(c => c.file_path).filter((v, i, a) => a.indexOf(v) === i)

    return NextResponse.json({ answer, sources: sourcesUsed })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error'
    console.error('[Founder Chat] Error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
