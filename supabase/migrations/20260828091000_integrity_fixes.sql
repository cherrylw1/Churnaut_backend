-- Runtime columns and functions required by the application.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_visits integer DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lemonsqueezy_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lemonsqueezy_subscription_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lemonsqueezy_variant_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS visits_reset_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_lemonsqueezy_subscription
  ON clients(lemonsqueezy_subscription_id);

CREATE OR REPLACE FUNCTION increment_click_count(session_id_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE sessions
  SET click_count = COALESCE(click_count, 0) + 1,
      clicked_at = COALESCE(clicked_at, now())
  WHERE id = session_id_input
  RETURNING click_count INTO updated_count;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION replace_routing_rules(client_id_input UUID, rules_input JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE inserted_count INTEGER;
BEGIN
  DELETE FROM routing_rules WHERE client_id = client_id_input;
  INSERT INTO routing_rules (
    client_id, priority, active, signal_type, conditions, action_type,
    action_payload, target_selector, variant_content
  )
  SELECT
    client_id_input, r.priority, COALESCE(r.active, true), r.signal_type,
    COALESCE(r.conditions, '{}'::jsonb), r.action_type,
    COALESCE(r.action_payload, '{}'::jsonb), r.target_selector, r.variant_content
  FROM jsonb_to_recordset(rules_input) AS r(
    priority INTEGER, active BOOLEAN, signal_type TEXT, conditions JSONB,
    action_type TEXT, action_payload JSONB, target_selector TEXT, variant_content TEXT
  );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_click_count(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION replace_routing_rules(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_click_count(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION replace_routing_rules(UUID, JSONB) TO service_role;

-- The legacy quota function is no longer used by the app. Guard the revoke so
-- this migration also works on installations that never created the function.
DO $$
BEGIN
  IF to_regprocedure('public.increment_monthly_visits(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION increment_monthly_visits(UUID) FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

-- Recoverable Lemon Squeezy webhook claims. Existing rows represent webhooks
-- that were successfully processed by the legacy implementation.
ALTER TABLE processed_webhooks ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE processed_webhooks ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE processed_webhooks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE processed_webhooks ADD COLUMN IF NOT EXISTS attempts integer;
ALTER TABLE processed_webhooks ADD COLUMN IF NOT EXISTS last_error text;
UPDATE processed_webhooks
SET status = COALESCE(status, 'completed'),
    completed_at = COALESCE(completed_at, processed_at),
    attempts = COALESCE(attempts, 1);
ALTER TABLE processed_webhooks ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE processed_webhooks ALTER COLUMN status SET NOT NULL;
ALTER TABLE processed_webhooks ALTER COLUMN attempts SET DEFAULT 1;
ALTER TABLE processed_webhooks ALTER COLUMN attempts SET NOT NULL;
ALTER TABLE processed_webhooks DROP CONSTRAINT IF EXISTS processed_webhooks_status_check;
ALTER TABLE processed_webhooks ADD CONSTRAINT processed_webhooks_status_check
  CHECK (status IN ('processing', 'completed', 'failed'));

-- Auth and tenant provisioning are one transaction, preventing orphan users.
CREATE OR REPLACE FUNCTION public.handle_new_churnaut_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  company_label text;
  company_slug text;
BEGIN
  company_label := COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'company_name'), ''), 'Workspace');
  company_slug := LEFT(REGEXP_REPLACE(LOWER(company_label), '[^a-z0-9]', '', 'g'), 40);
  IF company_slug = '' THEN company_slug := 'workspace'; END IF;

  INSERT INTO public.clients (id, company_name, domain, email, plan, active)
  VALUES (
    NEW.id,
    company_label,
    company_slug || '-' || LEFT(NEW.id::text, 8) || '.com',
    LOWER(NEW.email),
    'starter',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_churnaut_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS on_auth_user_created_create_churnaut_client ON auth.users;
CREATE TRIGGER on_auth_user_created_create_churnaut_client
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_churnaut_user();

-- Repair previously orphaned email/password users using their signup metadata.
INSERT INTO public.clients (id, company_name, domain, email, plan, active)
SELECT
  users.id,
  COALESCE(NULLIF(BTRIM(users.raw_user_meta_data->>'company_name'), ''), 'Workspace'),
  COALESCE(
    NULLIF(LEFT(REGEXP_REPLACE(LOWER(users.raw_user_meta_data->>'company_name'), '[^a-z0-9]', '', 'g'), 40), ''),
    'workspace'
  ) || '-' || LEFT(users.id::text, 8) || '.com',
  LOWER(users.email),
  'starter',
  true
FROM auth.users AS users
WHERE users.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.clients WHERE clients.id = users.id)
ON CONFLICT (id) DO NOTHING;

-- Weekly digest delivery claims prevent duplicate sends and allow failed or
-- abandoned attempts to be retried safely.
ALTER TABLE weekly_digests ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE weekly_digests ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE weekly_digests ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE weekly_digests ADD COLUMN IF NOT EXISTS attempts integer;
ALTER TABLE weekly_digests ADD COLUMN IF NOT EXISTS last_error text;
UPDATE weekly_digests
SET delivery_status = COALESCE(delivery_status, 'sent'),
    sent_at = COALESCE(sent_at, created_at),
    attempts = COALESCE(attempts, 1);
ALTER TABLE weekly_digests ALTER COLUMN delivery_status SET DEFAULT 'sent';
ALTER TABLE weekly_digests ALTER COLUMN delivery_status SET NOT NULL;
ALTER TABLE weekly_digests ALTER COLUMN attempts SET DEFAULT 1;
ALTER TABLE weekly_digests ALTER COLUMN attempts SET NOT NULL;
ALTER TABLE weekly_digests DROP CONSTRAINT IF EXISTS weekly_digests_delivery_status_check;
ALTER TABLE weekly_digests ADD CONSTRAINT weekly_digests_delivery_status_check
  CHECK (delivery_status IN ('processing', 'sent', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_digests_client_week
  ON weekly_digests(client_id, week_start);

-- Public snippets use the server resolve endpoint; they do not need direct
-- anonymous table access. Remove the former cross-tenant policies.
DROP POLICY IF EXISTS "Snippet can create sessions" ON sessions;
DROP POLICY IF EXISTS "Snippet can update sessions" ON sessions;
DROP POLICY IF EXISTS "Snippet can view active routing rules" ON routing_rules;
DROP POLICY IF EXISTS "Snippet can insert analytics events" ON analytics_events;
