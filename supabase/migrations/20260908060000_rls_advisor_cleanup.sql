-- Supabase advisor cleanup: preserve tenant semantics while avoiding per-row
-- auth.uid() evaluation and overlapping permissive policies.
BEGIN;

-- Tables with separate read/write policies keep their original policy names but
-- evaluate auth.uid() once per statement.
DROP POLICY IF EXISTS "Clients can view their own profile" ON public.clients;
DROP POLICY IF EXISTS "Clients can update their own profile" ON public.clients;
CREATE POLICY "Clients can view their own profile" ON public.clients
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Clients can update their own profile" ON public.clients
  FOR UPDATE TO authenticated USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Clients can view their own analytics events" ON public.analytics_events;
CREATE POLICY "Clients can view their own analytics events" ON public.analytics_events
  FOR SELECT TO authenticated USING (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Clients manage own domains" ON public.client_domains;
CREATE POLICY "Clients manage own domains" ON public.client_domains
  FOR ALL TO authenticated USING (client_id = (select auth.uid()))
  WITH CHECK (client_id = (select auth.uid()));

-- Feature tables originated in optional helper SQL on older installations.
-- Upgrade them only when present so this migration remains safe on a partial
-- deployment; it never creates missing feature tables implicitly.
DO $$
DECLARE
  policy_row record;
BEGIN
  IF to_regclass('public.anomaly_alerts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Clients can view their own anomaly alerts" ON public.anomaly_alerts;
    DROP POLICY IF EXISTS "Clients can update their own anomaly alerts" ON public.anomaly_alerts;
    EXECUTE 'CREATE POLICY "Clients can view their own anomaly alerts" ON public.anomaly_alerts FOR SELECT TO authenticated USING (client_id = (select auth.uid()))';
    EXECUTE 'CREATE POLICY "Clients can update their own anomaly alerts" ON public.anomaly_alerts FOR UPDATE TO authenticated USING (client_id = (select auth.uid())) WITH CHECK (client_id = (select auth.uid()))';
  END IF;

  FOR policy_row IN
    SELECT * FROM (VALUES
    ('sessions', 'Clients can view their own sessions', 'Clients can manage their own sessions'),
    ('routing_rules', 'Clients can view their own routing rules', 'Clients can manage their own routing rules'),
    ('webhook_mappings', 'Clients can view their own webhook mappings', 'Clients can manage their own webhook mappings'),
    ('crm_tokens', 'Clients can view their own crm tokens', 'Clients can manage their own crm tokens'),
    ('weekly_digests', 'Clients can view their own weekly digests', 'Clients can manage their own weekly digests'),
    ('deal_scores', 'Clients can view their own deal scores', 'Clients can manage their own deal scores'),
    ('pipeline_snapshots', 'Clients can view their own pipeline snapshots', 'Clients can manage their own pipeline snapshots'),
    ('scout_nudges', 'Clients can view their own scout nudges', 'Clients can manage their own scout nudges'),
    ('company_deal_patterns', 'Clients can view their own company deal patterns', 'Clients can manage their own company deal patterns'),
    ('deal_obituaries', 'Clients can view their own deal obituaries', 'Clients can manage their own deal obituaries'),
    ('icp_profiles', 'Clients can view their own icp profiles', 'Clients can manage their own icp profiles')
    ) AS policies(table_name, read_policy, manage_policy)
  LOOP
    IF to_regclass(format('public.%I', policy_row.table_name)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.read_policy, policy_row.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.manage_policy, policy_row.table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (client_id = (select auth.uid())) WITH CHECK (client_id = (select auth.uid()))', policy_row.manage_policy, policy_row.table_name);
    END IF;
  END LOOP;
END $$;

-- These tables are written only with the server service-role client. Enabling
-- RLS closes accidental browser access without changing application behavior.
ALTER TABLE IF EXISTS public.processed_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.playbook_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.code_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_embeddings ENABLE ROW LEVEL SECURITY;

COMMIT;
