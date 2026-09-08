-- Reproducible pgvector storage for codebase and support retrieval.
-- This migration is additive: existing rows are preserved and incompatible
-- pre-existing objects fail with an actionable error instead of being rebuilt.
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  vector_schema text;
  vector_type text;
  target record;
BEGIN
  SELECT n.nspname INTO vector_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';

  IF vector_schema IS NULL THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'pgvector is required for RAG embeddings; enable the vector extension in Supabase before applying this migration (%).', SQLERRM;
    END;
    vector_schema := 'extensions';
  END IF;

  vector_type := format('%I.vector(1024)', vector_schema);

  -- Existing installations are validated before any index/function work. A
  -- table that merely has the right name is not enough: ingest relies on the
  -- complete shape and a 1024-dimension vector column.
  FOR target IN SELECT * FROM (VALUES ('code_embeddings'::text, 'file_path', 'file_type'), ('support_embeddings'::text, 'doc_name', 'doc_type')) AS v(table_name, key_column, secondary_column) LOOP
    IF to_regclass(format('public.%I', target.table_name)) IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM (VALUES
          ('id'), (target.key_column), (target.secondary_column), ('chunk_index'), ('content'), ('token_count'), ('embedding'), ('last_indexed_at')
        ) AS required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = target.table_name AND c.column_name = required.column_name
        )
      ) THEN RAISE EXCEPTION 'Existing public.% is missing a required column; expected the complete RAG schema. No data was changed.', target.table_name; END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = target.table_name
          AND c.column_name IN ('id', target.key_column, target.secondary_column, 'chunk_index', 'content', 'token_count', 'embedding', 'last_indexed_at')
          AND c.is_nullable = 'YES'
      ) THEN RAISE EXCEPTION 'Existing public.% has nullable required columns; expected NOT NULL RAG fields. No data was changed.', target.table_name; END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = target.table_name
          AND ((c.column_name IN (target.key_column, target.secondary_column, 'content') AND c.data_type <> 'text')
            OR (c.column_name IN ('chunk_index', 'token_count') AND c.data_type <> 'integer')
            OR (c.column_name = 'id' AND c.data_type <> 'uuid'))
      ) THEN RAISE EXCEPTION 'Existing public.% has incompatible column types; expected UUID/text/integer RAG fields. No data was changed.', target.table_name; END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=target.table_name AND c.column_name='last_indexed_at' AND c.data_type <> 'timestamp with time zone') THEN RAISE EXCEPTION 'Existing public.% last_indexed_at must be timestamptz. No data was changed.', target.table_name; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = target.table_name AND a.attname = 'embedding'
          AND format_type(a.atttypid, a.atttypmod) LIKE '%vector(1024)'
      ) THEN RAISE EXCEPTION 'Existing public.% embedding column is not vector(1024). No data was changed.', target.table_name; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = target.table_name AND con.contype = 'u'
          AND con.conkey = ARRAY[
            (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = target.key_column),
            (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'chunk_index')
          ]::smallint[]
      ) THEN RAISE EXCEPTION 'Existing public.% is missing the unique (% , chunk_index) constraint. No data was changed.', target.table_name, target.key_column; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = target.table_name AND con.contype = 'p'
          AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id')]::smallint[]
      ) OR NOT EXISTS (
        SELECT 1 FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.adnum JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=target.table_name AND a.attname='id' AND pg_get_expr(d.adbin,d.adrelid) ILIKE '%gen_random_uuid%'
      ) THEN RAISE EXCEPTION 'Existing public.% id must be a primary key with a default UUID. No data was changed.', target.table_name; END IF;
    END IF;
  END LOOP;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.code_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      file_path text NOT NULL,
      file_type text NOT NULL,
      chunk_index integer NOT NULL CHECK (chunk_index >= 0),
      content text NOT NULL,
      token_count integer NOT NULL DEFAULT 0 CHECK (token_count >= 0),
      embedding %s NOT NULL,
      last_indexed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (file_path, chunk_index)
    )
  $sql$, vector_type);
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.support_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      doc_name text NOT NULL,
      doc_type text NOT NULL,
      chunk_index integer NOT NULL CHECK (chunk_index >= 0),
      content text NOT NULL,
      token_count integer NOT NULL DEFAULT 0 CHECK (token_count >= 0),
      embedding %s NOT NULL,
      last_indexed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (doc_name, chunk_index)
    )
  $sql$, vector_type);

  FOR target IN SELECT * FROM (VALUES ('code_embeddings'::text), ('support_embeddings'::text)) AS v(table_name) LOOP
    IF to_regclass(format('public.%s_embedding_hnsw', target.table_name)) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace JOIN pg_am am ON am.oid = i.relam
        JOIN pg_index ix ON ix.indexrelid = i.oid JOIN pg_opclass op ON op.oid = ANY(ix.indclass)
        WHERE n.nspname = 'public' AND i.relname = format('%s_embedding_hnsw', target.table_name)
          AND ix.indrelid = format('public.%I', target.table_name)::regclass
          AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = ix.indrelid AND a.attname = 'embedding')
          AND am.amname = 'hnsw' AND op.opcname = 'vector_cosine_ops'
      ) THEN RAISE EXCEPTION 'Existing index public.%_embedding_hnsw is not an HNSW cosine index. Rename/remove it manually; no data was changed.', target.table_name; END IF;
    ELSE
      EXECUTE format('CREATE INDEX %I ON public.%I USING hnsw (embedding %I.vector_cosine_ops)', format('%s_embedding_hnsw', target.table_name), target.table_name, vector_schema);
    END IF;
  END LOOP;

  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION public.match_code_chunks(
      query_embedding %s, match_threshold float, match_count integer
    ) RETURNS TABLE (id uuid, file_path text, content text, similarity float)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, %I, pg_temp AS $fn$
      SELECT e.id, e.file_path, e.content, 1 - (e.embedding <=> query_embedding) AS similarity
      FROM public.code_embeddings e
      WHERE 1 - (e.embedding <=> query_embedding) >= match_threshold
      ORDER BY e.embedding <=> query_embedding
      LIMIT LEAST(GREATEST(match_count, 1), 50)
    $fn$
  $sql$, vector_type, vector_schema);
  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION public.match_support_chunks(
      query_embedding %s, match_threshold float, match_count integer
    ) RETURNS TABLE (id uuid, doc_name text, content text, similarity float)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, %I, pg_temp AS $fn$
      SELECT e.id, e.doc_name, e.content, 1 - (e.embedding <=> query_embedding) AS similarity
      FROM public.support_embeddings e
      WHERE 1 - (e.embedding <=> query_embedding) >= match_threshold
      ORDER BY e.embedding <=> query_embedding
      LIMIT LEAST(GREATEST(match_count, 1), 50)
    $fn$
  $sql$, vector_type, vector_schema);
END $$;

CREATE OR REPLACE FUNCTION public.verify_rag_schema()
RETURNS TABLE (object_name text, ready boolean, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  WITH tables AS (
    SELECT t.table_name, CASE WHEN t.table_name = 'code_embeddings' THEN 'file_path' ELSE 'doc_name' END AS key_col,
           CASE WHEN t.table_name = 'code_embeddings' THEN 'file_type' ELSE 'doc_type' END AS secondary_col
    FROM (VALUES ('code_embeddings'::text), ('support_embeddings'::text)) t(table_name)
  ), checks AS (
    SELECT table_name,
      to_regclass(format('public.%I', table_name)) IS NOT NULL AS exists_ok,
      NOT EXISTS (SELECT 1 FROM (VALUES ('id'),(key_col),(secondary_col),('chunk_index'),('content'),('token_count'),('embedding'),('last_indexed_at')) req(column_name) WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name=req.column_name)) AS columns_ok,
      NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name IN ('id', key_col, secondary_col, 'chunk_index', 'content', 'token_count', 'embedding', 'last_indexed_at') AND c.is_nullable='YES') AS nullability_ok,
      NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND ((c.column_name IN (key_col, secondary_col, 'content') AND c.data_type <> 'text') OR (c.column_name IN ('chunk_index','token_count') AND c.data_type <> 'integer') OR (c.column_name='id' AND c.data_type <> 'uuid'))) AS types_ok,
      NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='last_indexed_at' AND c.data_type <> 'timestamp with time zone') AS timestamp_ok,
      EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class cl ON cl.oid=a.attrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=t.table_name AND a.attname='embedding' AND format_type(a.atttypid,a.atttypmod) LIKE '%vector(1024)') AS dimension_ok,
      EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=t.table_name AND con.contype='u' AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=cl.oid AND a.attname=key_col),(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=cl.oid AND a.attname='chunk_index')]::smallint[]) AS unique_ok,
      EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=t.table_name AND con.contype='p' AND con.conkey=ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=cl.oid AND a.attname='id')]::smallint[]) AND EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_class cl ON cl.oid=d.adrelid JOIN pg_attribute a ON a.attrelid=cl.oid AND a.attnum=d.adnum JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=t.table_name AND a.attname='id' AND pg_get_expr(d.adbin,d.adrelid) ILIKE '%gen_random_uuid%') AS primary_ok,
      EXISTS (SELECT 1 FROM pg_class i JOIN pg_namespace n ON n.oid=i.relnamespace JOIN pg_am am ON am.oid=i.relam JOIN pg_index ix ON ix.indexrelid=i.oid JOIN pg_opclass op ON op.oid=ANY(ix.indclass) WHERE n.nspname='public' AND i.relname=format('%s_embedding_hnsw',table_name) AND ix.indrelid=format('public.%I',table_name)::regclass AND ix.indkey[0]=(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=ix.indrelid AND a.attname='embedding') AND am.amname='hnsw' AND op.opcname='vector_cosine_ops') AS index_ok
    FROM tables t
  )
  SELECT table_name || '.shape', exists_ok AND columns_ok AND nullability_ok AND types_ok AND timestamp_ok AND dimension_ok AND unique_ok AND primary_ok AND index_ok, format('exists=%s columns=%s nullability=%s types=%s timestamp=%s dimension=%s unique=%s primary=%s index=%s', exists_ok, columns_ok, nullability_ok, types_ok, timestamp_ok, dimension_ok, unique_ok, primary_ok, index_ok) FROM checks
  UNION ALL SELECT 'match_code_chunks.rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='match_code_chunks'), 'RPC is installed'
  UNION ALL SELECT 'match_support_chunks.rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='match_support_chunks'), 'RPC is installed'
$$;
REVOKE ALL ON FUNCTION public.verify_rag_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_rag_schema() TO service_role;

ALTER TABLE public.code_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.code_embeddings, public.support_embeddings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.code_embeddings, public.support_embeddings TO service_role;
REVOKE ALL ON FUNCTION public.match_code_chunks, public.match_support_chunks FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_code_chunks, public.match_support_chunks TO service_role;
