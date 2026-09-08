import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
const supabase = createClient(url, key)
const failures: string[] = []

for (const table of ['code_embeddings', 'support_embeddings']) {
  const { error } = await supabase.from(table).select('id, embedding').limit(1)
  if (error) failures.push(`${table}: ${error.message}`)
  else console.log(`${table}: PASS`)
}

const { data: schemaChecks, error: schemaError } = await supabase.rpc('verify_rag_schema')
if (schemaError) failures.push(`verify_rag_schema: ${schemaError.message}`)
else for (const check of schemaChecks || []) {
  if (!check.ready) failures.push(`${check.object_name}: ${check.detail}`)
  else console.log(`${check.object_name}: PASS`)
}

if (failures.length) {
  console.error('RAG schema verification FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else console.log('RAG schema verification PASS')
