-- Harden internal database functions reported by Supabase's security advisor.
-- Trigger functions are not callable by API roles, and application RPCs are
-- service-role only with a fixed search path. Optional RAG objects are guarded
-- so the migration remains reproducible on installations that omit them.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS identity, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_churnaut_user',
        'rls_auto_enable',
        'increment_monthly_visits',
        'increment_monthly_visits_if_available',
        'increment_click_count',
        'replace_routing_rules',
        'match_code_chunks',
        'match_support_chunks'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', target.identity);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', target.identity);

    IF target.proname IN (
      'increment_monthly_visits_if_available',
      'increment_click_count',
      'replace_routing_rules',
      'match_code_chunks',
      'match_support_chunks'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target.identity);
    END IF;
  END LOOP;

  IF to_regclass('public.code_embeddings') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.code_embeddings FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.code_embeddings TO service_role;
  END IF;

  IF to_regclass('public.support_embeddings') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.support_embeddings FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_embeddings TO service_role;
  END IF;
END;
$$;
