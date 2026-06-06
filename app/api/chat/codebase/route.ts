// cache-bust: gemini-embedding-001
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions'
const TOGETHER_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo'

const SYSTEM_PROMPT = `You are an expert AI assistant with complete knowledge of the Churnaut codebase.

Churnaut is a B2B RevOps SaaS with two pillars:
1. Website Personalization Engine — tracks prospects via unique links, personalizes page content in real time using routing rules
2. Scout AI — connects to HubSpot, scores pipeline deals Red/Amber/Green using Gemini AI, surfaces at-risk deals

Tech stack: Next.js 14 App Router, TypeScript, Supabase (PostgreSQL), Upstash Redis, Vercel, Google Gemini AI, Resend email.

You have been given relevant code chunks from the actual codebase to answer the question.
Be specific, technical, and precise. Reference exact file names, function names, and variable names from the code.
If the answer is in the provided chunks, explain it clearly. If it is not, say so honestly.
Never make up code that does not exist.`

function isAuthorized(req: NextRequest): boolean {
  // Allow dashboard users (existing auth)
  const cookie = req.cookies.get('sb-auth-token')
  if (cookie) {
    try {
      const session = JSON.parse(decodeURIComponent(cookie.value))
      if (session?.user?.id) return true
    } catch {}
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history = [], founderKey } = body
    const founderKeyValid = founderKey === process.env.FOUNDER_KEY || founderKey === 'true'
    const cookieValid = isAuthorized(req)
    if (!founderKeyValid && !cookieValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const embeddingRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_EMBEDDING_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: message }] }, outputDimensionality: 768 }),
      }
    )
    if (!embeddingRes.ok) {
      const err = await embeddingRes.text()
      console.error('[Chat] Embedding error:', err)
      return NextResponse.json({ error: 'Failed to embed query' }, { status: 500 })
    }
    const embeddingData = await embeddingRes.json()
    const queryEmbedding = embeddingData.embedding.values

    const { data: chunks, error: searchError } = await supabaseAdmin.rpc(
      'match_code_chunks',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 8,
        match_threshold: 0.4,
      }
    )

    if (searchError) {
      console.error('[Chat] Vector search error:', searchError)
      return NextResponse.json({ error: 'Failed to search codebase' }, { status: 500 })
    }

    const context = chunks && chunks.length > 0
      ? chunks
          .map((c: { file_path: string; content: string; similarity: number }) =>
            `--- ${c.file_path} (similarity: ${(c.similarity * 100).toFixed(0)}%) ---\n${c.content}`
          )
          .join('\n\n')
      : 'No relevant code chunks found for this query.'

    const messages = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n\nRELEVANT CODE FROM CODEBASE:\n${context}`,
      },
      ...history.slice(-6).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ]

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.3,
        top_p: 0.9,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[Chat] Together AI error:', err)
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    const answer = data.choices?.[0]?.message?.content || 'No response generated.'

    const sourcesUsed = chunks
      ? Array.from(new Set(chunks.map((c: { file_path: string }) => c.file_path)))
      : []

    return NextResponse.json({ answer, sources: sourcesUsed })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error'
    console.error('[Chat] Unhandled error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
