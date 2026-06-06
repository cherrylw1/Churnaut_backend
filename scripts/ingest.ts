import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


const TARGET_FILES = [
  'app/api/ai/anomaly/route.ts',
  'app/api/ai/copywriter/route.ts',
  'app/api/ai/digest/route.ts',
  'app/api/ai/onboarding/route.ts',
  'app/api/analytics/route.ts',
  'app/api/client/route.ts',
  'app/api/dashboard/summary/route.ts',
  'app/api/icp/route.ts',
  'app/api/links/route.ts',
  'app/api/oauth/calendly/callback/route.ts',
  'app/api/oauth/calendly/route.ts',
  'app/api/oauth/calendly/status/route.ts',
  'app/api/oauth/close/callback/route.ts',
  'app/api/oauth/close/route.ts',
  'app/api/oauth/crm/route.ts',
  'app/api/oauth/hubspot/callback/route.ts',
  'app/api/oauth/hubspot/route.ts',
  'app/api/oauth/pipedrive/callback/route.ts',
  'app/api/oauth/pipedrive/route.ts',
  'app/api/oauth/zoho/callback/route.ts',
  'app/api/oauth/zoho/route.ts',
  'app/api/onboarding/status/route.ts',
  'app/api/playbooks/route.ts',
  'app/api/resolve/route.ts',
  'app/api/rules/route.ts',
  'app/api/scout/blindspots/route.ts',
  'app/api/scout/nudge/route.ts',
  'app/api/scout/obituaries/route.ts',
  'app/api/scout/pipeline/route.ts',
  'app/api/scout/score/route.ts',
  'app/api/scout/trigger-score/route.ts',
  'app/api/signup/route.ts',
  'app/api/snippet-status/route.ts',
  'app/api/webhook/logs/route.ts',
  'app/api/webhook/mappings/route.ts',
  'app/api/webhook/route.ts',
  'app/dashboard/layout.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/links/page.tsx',
  'app/dashboard/rules/page.tsx',
  'app/dashboard/analytics/page.tsx',
  'app/dashboard/scout/page.tsx',
  'app/dashboard/icp/page.tsx',
  'app/dashboard/ai-insights/page.tsx',
  'app/dashboard/integrations/page.tsx',
  'app/dashboard/integrations/calendly/page.tsx',
  'app/dashboard/integrations/crm/page.tsx',
  'app/dashboard/integrations/crm/hubspot/page.tsx',
  'app/dashboard/integrations/crm/pipedrive/page.tsx',
  'app/dashboard/integrations/crm/zoho/page.tsx',
  'app/dashboard/integrations/crm/close/page.tsx',
  'app/dashboard/integrations/webhooks/page.tsx',
  'app/dashboard/snippet/page.tsx',
  'app/dashboard/settings/page.tsx',
  'lib/rules-engine.ts',
  'lib/scout-scoring.ts',
  'lib/integrations/hubspot.ts',
  'lib/integrations/hubspot-pipeline.ts',
  'lib/llm/logger.ts',
  'lib/email/resend.ts',
  'lib/supabase.ts',
  'lib/redis.ts',
  'lib/crypto.ts',
  'lib/utils.ts',
  'middleware.ts',
  'public/snippet.js',
  'types/index.ts',
  'hooks/useToast.ts',
  'hooks/useKeyboardShortcuts.ts',
]

function getFileType(filePath: string): string {
  if (filePath.includes('app/api/')) return 'route'
  if (filePath.includes('lib/integrations/')) return 'integration'
  if (filePath.includes('lib/')) return 'lib'
  if (filePath.includes('app/dashboard/')) return 'component'
  if (filePath.includes('components/')) return 'component'
  if (filePath.includes('hooks/')) return 'hook'
  if (filePath.includes('public/')) return 'snippet'
  if (filePath.includes('types/')) return 'types'
  return 'config'
}

function chunkContent(content: string): string[] {
  const CHUNK_SIZE = 1500
  const OVERLAP = 200
  if (content.length <= 2000) return [content]
  const chunks: string[] = []
  let start = 0
  while (start < content.length) {
    const end = Math.min(start + CHUNK_SIZE, content.length)
    chunks.push(content.slice(start, end))
    start += CHUNK_SIZE - OVERLAP
  }
  return chunks
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_EMBEDDING_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768 }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.embedding.values
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function ingest() {
  console.log('Starting Churnaut codebase ingestion...')
  console.log(`Target: ${TARGET_FILES.length} files\n`)

  const { error: clearError } = await supabase
    .from('code_embeddings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (clearError) {
    console.error('Failed to clear existing embeddings:', clearError)
    process.exit(1)
  }
  console.log('Cleared existing embeddings.\n')

  let totalChunks = 0
  let skipped = 0

  for (const filePath of TARGET_FILES) {
    const fullPath = path.join(process.cwd(), filePath)

    if (!fs.existsSync(fullPath)) {
      console.log(`  SKIP (not found): ${filePath}`)
      skipped++
      continue
    }

    const content = fs.readFileSync(fullPath, 'utf-8').trim()
    if (!content) {
      console.log(`  SKIP (empty): ${filePath}`)
      skipped++
      continue
    }

    const fileType = getFileType(filePath)
    const chunks = chunkContent(content)

    console.log(`  Indexing: ${filePath} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`)

    for (let i = 0; i < chunks.length; i++) {
      const contextualChunk = `File: ${filePath}\nType: ${fileType}\n\n${chunks[i]}`
      try {
        const embedding = await embedText(contextualChunk)
        const { error } = await supabase.from('code_embeddings').insert({
          file_path: filePath,
          file_type: fileType,
          chunk_index: i,
          content: contextualChunk,
          token_count: Math.ceil(contextualChunk.length / 4),
          embedding: JSON.stringify(embedding),
          last_indexed_at: new Date().toISOString(),
        })
        if (error) {
          console.error(`    ERROR inserting chunk ${i}:`, error.message)
        } else {
          totalChunks++
        }
        await sleep(200)
      } catch (err) {
        console.error(`    ERROR embedding chunk ${i}:`, err)
      }
    }
  }

  console.log(`\nIngestion complete.`)
  console.log(`Total chunks indexed: ${totalChunks}`)
  console.log(`Files skipped: ${skipped}`)
}

ingest().catch(console.error)
