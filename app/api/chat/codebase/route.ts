import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuthedClientId } from '@/lib/auth'
import { embed, generateChat } from '@/lib/llm/complete'
import { chatRequestSchema, readJson } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are an expert AI assistant with complete knowledge of the Churnaut codebase.

Churnaut is a B2B RevOps SaaS with two pillars:
1. Website Personalization Engine — tracks prospects via unique links, personalizes page content in real time using routing rules
2. Scout AI — connects to HubSpot, scores pipeline deals Red/Amber/Green using Gemini AI, surfaces at-risk deals

Tech stack: Next.js 16 App Router, React 19, TypeScript, Supabase (PostgreSQL), Upstash Redis, Vercel, Together AI, and Resend email.

You have been given relevant code chunks from the actual codebase to answer the question.
Be specific, technical, and precise. Reference exact file names, function names, and variable names from the code.
If the answer is in the provided chunks, explain it clearly. If it is not, say so honestly.
Never make up code that does not exist.`



async function embedQuery(text: string): Promise<number[]> {
  return embed(text, { type: 'query', context: { feature: 'codebase_query_embedding', scope: 'internal' } })
}

export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req)
    if (!clientId || clientId !== 'founder') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const parsedBody = await readJson(req, chatRequestSchema)
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 })
    const { message, history } = parsedBody.data

    let chunks: Array<{ file_path: string; content: string; similarity: number }> = [];
    try {
      const queryEmbedding = await embedQuery(message);

      const { data, error: searchError } = await supabaseAdmin.rpc(
          'match_code_chunks',
          {
            query_embedding: JSON.stringify(queryEmbedding),
            match_count: 8,
            match_threshold: 0.4,
          }
        )
        if (!searchError) {
          chunks = data || [];
        } else {
          console.error('[Chat] Vector search error:', searchError)
        }
    } catch (err) {
      console.error('[Chat] Embedding exception:', err)
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

    let answer: string
    try { answer = await generateChat(messages, { maxTokens: 1024, temperature: 0.3, context: { feature: 'codebase_chat', scope: 'internal' } }) || 'No response generated.' }
    catch (error) { console.error('[Chat] AI provider unavailable:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ error: 'AI inference failed' }, { status: 503 }) }

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
