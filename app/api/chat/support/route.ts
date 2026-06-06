import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

YOUR PERSONALITY:
- Friendly, direct, and helpful
- Give clear step-by-step instructions when explaining how to do something
- If you don't know the answer, say "I'm not sure about that — please reach out to support@churnaut.com"
- Keep answers concise but complete
- Always offer to help with something else at the end`

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_EMBEDDING_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768 }),
    }
  )
  if (!res.ok) throw new Error(`Embedding error ${res.status}`)
  const data = await res.json()
  return data.embedding.values
}

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    const queryEmbedding = await embedQuery(message)

    const { data: chunks, error: searchError } = await supabaseAdmin.rpc('match_support_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 6,
      match_threshold: 0.3,
    })

    if (searchError) {
      console.error('[Support Chat] Search error:', searchError)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    const context = chunks && chunks.length > 0
      ? chunks.map((c: { content: string }) => c.content).join('\n\n')
      : 'No specific documentation found for this query.'

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nRELEVANT PRODUCT DOCUMENTATION:\n${context}` },
      ...history.slice(-6).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
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
    return NextResponse.json({ answer })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error'
    console.error('[Support Chat] Error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
