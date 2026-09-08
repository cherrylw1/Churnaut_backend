-- Authoritative, service-role-only checks for the Supabase security-advisor contract.
CREATE OR REPLACE FUNCTION public.verify_supabase_advisor_state()
RETURNS TABLE(check_name text, ready boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  table_name text;
  managed text[] := ARRAY['sessions','routing_rules','client_domains','webhook_mappings','crm_tokens','weekly_digests','deal_scores','pipeline_snapshots','scout_nudges','company_deal_patterns','deal_obituaries','icp_profiles'];
  relation record;
  overlap_count integer;
  missing_count integer;
  slow_count integer;
BEGIN
  RETURN QUERY SELECT 'vector_in_extensions', EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector' AND n.nspname = 'extensions'), 'pgvector must be installed in extensions';
  RETURN QUERY SELECT 'vector_not_public', NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector' AND n.nspname = 'public'), 'pgvector must not remain in public';
  SELECT count(*) INTO missing_count FROM (VALUES
    ('clients','SELECT'),('clients','UPDATE'),('analytics_events','SELECT'),('anomaly_alerts','SELECT'),('anomaly_alerts','UPDATE'),
    ('sessions','SELECT'),('sessions','INSERT'),('sessions','UPDATE'),('sessions','DELETE'),('routing_rules','SELECT'),('routing_rules','INSERT'),('routing_rules','UPDATE'),('routing_rules','DELETE'),
    ('client_domains','SELECT'),('client_domains','INSERT'),('client_domains','UPDATE'),('client_domains','DELETE'),('webhook_mappings','SELECT'),('webhook_mappings','INSERT'),('webhook_mappings','UPDATE'),('webhook_mappings','DELETE'),
    ('crm_tokens','SELECT'),('crm_tokens','INSERT'),('crm_tokens','UPDATE'),('crm_tokens','DELETE'),('weekly_digests','SELECT'),('weekly_digests','INSERT'),('weekly_digests','UPDATE'),('weekly_digests','DELETE'),
    ('deal_scores','SELECT'),('deal_scores','INSERT'),('deal_scores','UPDATE'),('deal_scores','DELETE'),('pipeline_snapshots','SELECT'),('pipeline_snapshots','INSERT'),('pipeline_snapshots','UPDATE'),('pipeline_snapshots','DELETE'),
    ('scout_nudges','SELECT'),('scout_nudges','INSERT'),('scout_nudges','UPDATE'),('scout_nudges','DELETE'),('company_deal_patterns','SELECT'),('company_deal_patterns','INSERT'),('company_deal_patterns','UPDATE'),('company_deal_patterns','DELETE'),
    ('deal_obituaries','SELECT'),('deal_obituaries','INSERT'),('deal_obituaries','UPDATE'),('deal_obituaries','DELETE'),('icp_profiles','SELECT'),('icp_profiles','INSERT'),('icp_profiles','UPDATE'),('icp_profiles','DELETE')
  ) expected(tab, operation)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p CROSS JOIN unnest(p.roles) r(role_name)
    WHERE p.schemaname = 'public' AND p.tablename = expected.tab AND p.permissive = 'PERMISSIVE'
      AND (r.role_name IN ('authenticated','public')) AND (p.cmd = 'ALL' OR p.cmd = expected.operation)
  );
  RETURN QUERY SELECT 'expected_tenant_policies', missing_count = 0, format('missing expected tenant operations: %s', missing_count);

  SELECT count(*) INTO slow_count FROM pg_policies p
  WHERE p.schemaname = 'public' AND (
    (lower(coalesce(p.qual::text, '')) LIKE '%auth.uid()%' AND lower(coalesce(p.qual::text, '')) NOT LIKE '%select%auth.uid()%') OR
    (lower(coalesce(p.with_check::text, '')) LIKE '%auth.uid()%' AND lower(coalesce(p.with_check::text, '')) NOT LIKE '%select%auth.uid()%')
  );
  RETURN QUERY SELECT 'init_plan_auth_uid', slow_count = 0, format('policies using per-row auth.uid(): %s', slow_count);

  SELECT count(*) INTO overlap_count FROM (
    SELECT p.tablename, operation
    FROM (SELECT DISTINCT schemaname, tablename, policyname, cmd, roles, permissive FROM pg_policies) p
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']::text[]) AS ops(operation)
    WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE'
      AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
      AND (p.cmd = 'ALL' OR p.cmd = operation)
    GROUP BY p.tablename, operation
    HAVING count(*) > 1
  ) duplicates;
  RETURN QUERY SELECT 'permissive_policy_overlap', overlap_count = 0, format('overlapping effective policies: %s', overlap_count);

  FOREACH table_name IN ARRAY ARRAY['clients'] || managed LOOP
    SELECT c.relrowsecurity INTO relation FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = table_name;
    RETURN QUERY SELECT 'rls_' || table_name, COALESCE(relation.relrowsecurity, false), 'tenant table must have RLS enabled';
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['analytics_events','anomaly_alerts','processed_webhooks','playbook_templates','code_embeddings','support_embeddings'] LOOP
    SELECT c.relrowsecurity INTO relation FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = table_name;
    RETURN QUERY SELECT 'rls_' || table_name, COALESCE(relation.relrowsecurity, false), 'protected table must have RLS enabled';
  END LOOP;
  SELECT count(*) INTO missing_count FROM pg_policies p CROSS JOIN unnest(p.roles) r(role_name)
  WHERE p.schemaname = 'public' AND p.tablename IN ('processed_webhooks','playbook_templates','code_embeddings','support_embeddings')
    AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[]);
  RETURN QUERY SELECT 'service_only_policies', missing_count = 0, format('service-only tables have browser policies: %s', missing_count);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_supabase_advisor_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_supabase_advisor_state() TO service_role;
