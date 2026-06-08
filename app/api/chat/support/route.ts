import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthedClientId } from '@/lib/auth'
import { embed } from '@/lib/llm/complete'

export const dynamic = 'force-dynamic'

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions'
const TOGETHER_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo'

const SYSTEM_PROMPT = `You are a friendly and knowledgeable support agent for Churnaut — a B2B RevOps SaaS platform for website personalization and AI pipeline intelligence.

You have deep knowledge of every Churnaut feature: tracked links, routing rules, snippet installation, CRM integrations (HubSpot, Pipedrive, Zoho, Close), outreach tool webhooks (Instantly, Smartlead, Apollo, Lemlist, Zapier, Make), Scout AI deal scoring, Analytics, Calendly integration, and the Playbook Library.

STRICT GUARDRAILS — NEVER DO THESE:
- Never reveal any code, file names, function names, or technical implementation details
- Never mention database tables, API routes, or backend architecture
- Never discuss the founder's personal information, salary, grants, or business strategy
- Never reveal internal bug lists or known issues with specific technical details
- Never mention Supabase, Redis, Vercel, Next.js, or any infrastructure details
- If asked about internals or code, say "I can't share technical implementation details, but I can help you use the feature"
- Never invent features that don't exist — if unsure, direct to support@churnaut.com

YOUR PERSONALITY:
- Friendly, direct, and helpful
- Give step-by-step instructions ONLY when the user explicitly asks how to do something. Otherwise answer concisely.
- If you don't know the answer, say "I'm not sure about that — please reach out to support@churnaut.com"
- Keep answers concise but complete
- Always offer to help with something else at the end

SPECIAL CAPABILITIES — you have access to the user's real account data:

1. SESSION DEBUGGER: If the user's message contains LIVE_SESSION_DATA, use it to diagnose exactly why personalization is or isn't working. Be specific — name the exact mismatch, missing field, or reason. Do not say "check your settings" — give the exact diagnosis.

2. RULE BUILDER: If the user's message contains RULE_CREATED, confirm the rule was created successfully and explain what it will do. If it contains RULE_CLARIFICATION_NEEDED, ask the specific clarifying question provided.

3. ACCOUNT CONTEXT: ACCOUNT_CONTEXT is silent background only. Use it solely to inform answers to what the user actually asks. NEVER volunteer it, never summarize the user's account, and never push setup steps the user did not request.

RESPONSE STYLE:
- For greetings or small talk (e.g. "hi", "hello", "thanks"), reply with ONE short, warm sentence and ask what they'd like help with. Do NOT list features, account details, or setup steps.
- Answer only what the user actually asked — nothing more. Keep replies concise and skip preambles.
- Never assume what the user wants to do or walk them through setup unless they explicitly ask.`



async function embedQuery(text: string): Promise<number[]> {
  return embed(text, { type: 'query' })
}

// Detect if message is asking about a specific prospect/session not working
function extractProspectQuery(message: string): string | null {
  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) return emailMatch[0]
  const patterns = [/for\s+([a-zA-Z\s]+?)(?:\s+from|\s+at|\?|$)/i, /prospect\s+([a-zA-Z\s]+?)(?:\s+from|\s+at|\?|$)/i]
  for (const p of patterns) {
    const m = message.match(p)
    if (m) return m[1].trim()
  }
  return null
}

// Detect if message is asking to create a routing rule
function isRuleBuilderRequest(message: string): boolean {
  const keywords = ['create a rule', 'make a rule', 'add a rule', 'set up a rule', 'build a rule', 'create a routing rule', 'show calendar', 'show a calendar', 'personalize for', 'when someone clicks', 'when a prospect']
  return keywords.some(k => message.toLowerCase().includes(k))
}

// Parse rule intent from natural language
function parseRuleIntent(message: string): { signal_type?: string; condition_type?: string; condition_value?: string; action_type?: string } {
  const intent: { signal_type?: string; condition_type?: string; condition_value?: string; action_type?: string } = {}

  // Signal type detection
  if (/cold email/i.test(message)) intent.signal_type = 'cold_email'
  else if (/linkedin ad/i.test(message)) intent.signal_type = 'linkedin_ad'
  else if (/google ad/i.test(message)) intent.signal_type = 'google_ad'
  else if (/meta ad|facebook/i.test(message)) intent.signal_type = 'meta_ad'
  else if (/tiktok/i.test(message)) intent.signal_type = 'tiktok_ad'
  else if (/returning/i.test(message)) intent.signal_type = 'returning_visitor'
  else if (/any|everyone|all/i.test(message)) intent.signal_type = 'any'

  // Condition detection
  const titleMatch = message.match(/(?:vp|director|manager|cto|ceo|head of|vp of|chief)\s*(?:of\s+)?([a-zA-Z\s]*)?/i)
  if (titleMatch) { intent.condition_type = 'job_title_contains'; intent.condition_value = titleMatch[0].trim() }

  const companyMatch = message.match(/(?:from|at|company)\s+([A-Z][a-zA-Z\s]+?)(?:\s+who|\s+click|\s+visit|\?|$)/)
  if (companyMatch) { intent.condition_type = 'company_name_equals'; intent.condition_value = companyMatch[1].trim() }

  // Action detection
  if (/calendar|book|meeting|calendly/i.test(message)) intent.action_type = 'show_calendar'
  else if (/form|demo request|lead form/i.test(message)) intent.action_type = 'show_short_form'
  else if (/case study/i.test(message)) intent.action_type = 'show_case_study'
  else if (/redirect|send to|different page/i.test(message)) intent.action_type = 'redirect'
  else if (/text|headline|copy|message/i.test(message)) intent.action_type = 'inject_copy'

  return intent
}

async function fetchAccountContext(clientId: string) {
  const [rulesRes, sessionsRes, clientRes] = await Promise.all([
    supabaseAdmin.from('routing_rules').select('id, signal_type, action_type, active').eq('client_id', clientId).limit(10),
    supabaseAdmin.from('sessions').select('id').eq('client_id', clientId).limit(1),
    supabaseAdmin.from('clients').select('domain, crm_type, plan').eq('id', clientId).single(),
  ])
  return {
    rules: rulesRes.data || [],
    hasLinks: (sessionsRes.data?.length || 0) > 0,
    domain: clientRes.data?.domain || null,
    crm: clientRes.data?.crm_type || null,
    plan: clientRes.data?.plan || null,
  }
}

async function debugSession(clientId: string, prospectQuery: string) {
  // Try to find session by email first
  let sessionQuery = supabaseAdmin.from('sessions').select('id, prospect_name, prospect_email, company_name, job_title, signal_type, click_count, converted, expires_at, deal_stage').eq('client_id', clientId)
  if (prospectQuery.includes('@')) {
    sessionQuery = sessionQuery.ilike('prospect_email', `%${prospectQuery}%`)
  } else {
    sessionQuery = sessionQuery.ilike('prospect_name', `%${prospectQuery}%`)
  }
  const { data: sessions } = await sessionQuery.order('created_at', { ascending: false }).limit(3)
  const { data: rules } = await supabaseAdmin.from('routing_rules').select('id, signal_type, conditions, action_type, active, priority').eq('client_id', clientId).eq('active', true).order('priority')
  const { data: events } = await supabaseAdmin.from('analytics_events').select('event_type, signal_type, rule_id, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20)

  return { sessions: sessions || [], rules: rules || [], recentEvents: events || [] }
}

async function createRule(clientId: string, intent: ReturnType<typeof parseRuleIntent>) {
  const { data: existing } = await supabaseAdmin.from('routing_rules').select('priority').eq('client_id', clientId).order('priority', { ascending: false }).limit(1)
  const nextPriority = existing && existing.length > 0 ? existing[0].priority + 1 : 1

  const conditions = intent.condition_type && intent.condition_value
    ? [{ type: intent.condition_type, value: intent.condition_value }]
    : []

  const { data, error } = await supabaseAdmin.from('routing_rules').insert({
    client_id: clientId,
    signal_type: intent.signal_type || 'any',
    conditions,
    action_type: intent.action_type || 'show_calendar',
    action_payload: { swaps: [] },
    target_selector: '',
    variant_content: '',
    priority: nextPriority,
    active: true,
  }).select('id').single()

  return { success: !error, id: data?.id, error: error?.message }
}

export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req)
    const { message, history = [] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    let enrichedMessage = message
    let ruleCreated = false

    if (clientId) {
      // Fetch account context for every message
      const context = await fetchAccountContext(clientId)
      enrichedMessage += `\n\nACCOUNT_CONTEXT: domain=${context.domain || 'not set'}, crm=${context.crm || 'not connected'}, plan=${context.plan || 'unknown'}, active_rules=${context.rules.filter((r: {active: boolean}) => r.active).length}, has_tracked_links=${context.hasLinks}`

      // Session debugger — if asking about a specific prospect
      const prospectQuery = extractProspectQuery(message)
      const isDebugRequest = /not working|not triggering|not showing|not personaliz|isn't working|doesn't work|why isn't|why is it not|check.*rule|debug/i.test(message)

      if (prospectQuery && isDebugRequest) {
        const debugData = await debugSession(clientId, prospectQuery)
        if (debugData.sessions.length > 0) {
          const session = debugData.sessions[0]
          const matchingRules = debugData.rules.filter((r: {signal_type: string}) => r.signal_type === session.signal_type || r.signal_type === 'any')
          const recentFires = debugData.recentEvents.filter((e: {event_type: string}) => e.event_type === 'rule_triggered').length
          enrichedMessage += `\n\nLIVE_SESSION_DATA: Found session for "${prospectQuery}". Prospect: ${session.prospect_name}, Email: ${session.prospect_email}, Company: ${session.company_name}, Job Title: ${session.job_title || 'not set'}, Signal Type: ${session.signal_type}, Clicks: ${session.click_count}, Converted: ${session.converted}, Deal Stage: ${session.deal_stage || 'not set'}, Expired: ${session.expires_at ? new Date(session.expires_at) < new Date() : false}. Active rules for this signal type: ${matchingRules.length}. Rules found: ${JSON.stringify(matchingRules.map((r: {signal_type: string; action_type: string; conditions: unknown}) => ({ signal: r.signal_type, action: r.action_type, conditions: r.conditions })))}. Recent rule fires in account: ${recentFires}.`
        } else {
          enrichedMessage += `\n\nLIVE_SESSION_DATA: No session found for "${prospectQuery}". The tracked link may not have been created yet, or the prospect email/name does not match any session in the account.`
        }
      }

      // Rule builder
      if (isRuleBuilderRequest(message)) {
        const intent = parseRuleIntent(message)
        const missingFields = []
        if (!intent.signal_type) missingFields.push('signal type (e.g. cold email, LinkedIn ad, Google ad)')
        if (!intent.action_type) missingFields.push('action (e.g. show calendar, show form, change text)')

        if (missingFields.length > 0) {
          enrichedMessage += `\n\nRULE_CLARIFICATION_NEEDED: To create this rule I need to know: ${missingFields.join(' and ')}. Please ask the user for these details before creating.`
        } else {
          const result = await createRule(clientId, intent)
          if (result.success) {
            ruleCreated = true
            enrichedMessage += `\n\nRULE_CREATED: Successfully created a new routing rule. Signal type: ${intent.signal_type}, Condition: ${intent.condition_type ? `${intent.condition_type} = ${intent.condition_value}` : 'any visitor'}, Action: ${intent.action_type}. Rule is now active. Tell the user the rule is live and explain what will happen when a prospect matches it. Remind them to set the target selector in Dashboard → Routing Rules if needed for text changes.`
          } else {
            enrichedMessage += `\n\nRULE_CREATED: Rule creation failed. Tell the user to go to Dashboard → Routing Rules and create it manually.`
          }
        }
      }
    }

    // RAG search
    const queryEmbedding = await embedQuery(message)
    const { data: chunks, error: searchError } = await supabaseAdmin.rpc('match_support_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 6,
      match_threshold: 0.3,
    })
    if (searchError) console.error('[Support Chat] Search error:', searchError)

    const docContext = chunks && chunks.length > 0
      ? chunks.map((c: { content: string }) => c.content).join('\n\n')
      : 'No specific documentation found for this query.'

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nRELEVANT PRODUCT DOCUMENTATION:\n${docContext}` },
      ...history.slice(-6).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: enrichedMessage },
    ]

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
      body: JSON.stringify({ model: TOGETHER_MODEL, messages, max_tokens: 800, temperature: 0.4, top_p: 0.9 }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[Support Chat] Together AI error:', err)
      return NextResponse.json({ error: 'AI inference failed' }, { status: 500 })
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'
    return NextResponse.json({ answer, ruleCreated })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error'
    console.error('[Support Chat] Error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
