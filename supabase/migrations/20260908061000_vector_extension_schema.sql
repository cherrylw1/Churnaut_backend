-- Keep pgvector outside the public schema when the installed extension can be
-- relocated. Existing installations without pgvector are left untouched.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;

DO $$
DECLARE
  current_schema text;
BEGIN
  SELECT n.nspname INTO current_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';

  IF current_schema = 'public' THEN
    BEGIN
      ALTER EXTENSION vector SET SCHEMA extensions;
      EXCEPTION WHEN feature_not_supported OR dependent_objects_still_exist OR insufficient_privilege THEN
      RAISE NOTICE 'vector extension could not be relocated automatically; manual Supabase remediation required';
    END;
  END IF;
END $$;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS identity
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('match_code_chunks', 'match_support_chunks')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', target.identity);
  END LOOP;
END $$;
