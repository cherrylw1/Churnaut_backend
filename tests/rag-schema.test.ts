import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('reproducible RAG schema', () => {
  const root = resolve(process.cwd())
  const migration = readFileSync(resolve(root, 'supabase/migrations/20260909010000_rag_embeddings_schema.sql'), 'utf8')
  const baseline = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8')

  it('defines both tables, 1024-dimension vectors, indexes, and match RPCs', () => {
    for (const source of [migration, baseline]) {
      expect(source).toContain('code_embeddings')
      expect(source).toContain('support_embeddings')
      expect(source).toContain('vector(1024)')
      expect(source).toContain('embedding_hnsw')
      expect(source).toContain('match_code_chunks')
      expect(source).toContain('match_support_chunks')
      expect(source).toContain('verify_rag_schema')
      expect(source).toContain('REVOKE ALL ON TABLE')
    }
  })

  it('does not destructively rebuild existing embedding data', () => {
    expect(migration).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(public\.)?(code|support)_embeddings/i)
    expect(migration).toContain('incompatible')
    expect(migration).toContain('vector(1024)')
    expect(migration).toContain('missing a required column')
    expect(migration).toContain('not an HNSW cosine index')
    expect(migration).toContain('columns_ok')
    expect(migration).toContain('timestamp with time zone')
    expect(migration).toContain('gen_random_uuid')
    expect(migration).toContain('ix.indrelid')
    expect(readFileSync(resolve(root, 'scripts/rag/verify-schema.ts'), 'utf8')).toContain("rpc('verify_rag_schema')")
  })

  it('guards every ingestion path against wrong-length vectors', () => {
    for (const file of ['scripts/ingest.ts', 'scripts/ingest-changed.ts', 'scripts/ingest-context.ts', 'scripts/ingest-support.ts']) {
      const source = readFileSync(resolve(root, file), 'utf8')
      expect(source).toContain('assertEmbeddingVector')
    }
  })
})
