-- Data integrity and analytics fields used by the hardened application.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS destination_url text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_kind text NOT NULL DEFAULT 'tracked_link';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_snippet_ping_at timestamptz;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_kind_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_session_kind_check
  CHECK (session_kind IN ('tracked_link', 'anonymous_visit', 'webhook')) NOT VALID;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_session_kind_check;
CREATE INDEX IF NOT EXISTS idx_sessions_client_created ON sessions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_email_lower ON sessions(client_id, lower(prospect_email));
CREATE INDEX IF NOT EXISTS idx_events_client_type_created ON analytics_events(client_id, event_type, created_at DESC);

-- Rules outside the canonical runtime contract are disabled rather than
-- silently producing empty personalization responses.
UPDATE routing_rules SET active = false
WHERE action_type NOT IN ('show_calendar', 'inject_copy');

-- Preserve CRM connections independently (Calendly must never be removed by a CRM disconnect).
-- Production preflight verifies there are no duplicate (client_id, crm_type)
-- rows before this uniqueness constraint is applied.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tokens_client_type ON crm_tokens(client_id, crm_type);
ALTER TABLE crm_tokens ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'healthy';
ALTER TABLE crm_tokens ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE crm_tokens DROP CONSTRAINT IF EXISTS crm_tokens_connection_status_check;
ALTER TABLE crm_tokens ADD CONSTRAINT crm_tokens_connection_status_check
  CHECK (connection_status IN ('healthy', 'unhealthy')) NOT VALID;
ALTER TABLE crm_tokens VALIDATE CONSTRAINT crm_tokens_connection_status_check;

CREATE OR REPLACE FUNCTION complete_crm_oauth(
  client_id_input uuid,
  crm_type_input text,
  access_token_input text,
  refresh_token_input text,
  expires_at_input timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF client_id_input IS NULL OR btrim(crm_type_input) = '' OR btrim(access_token_input) = '' THEN
    RAISE EXCEPTION 'invalid oauth connection data';
  END IF;
  INSERT INTO crm_tokens (client_id, crm_type, access_token, refresh_token, expires_at, updated_at)
  VALUES (client_id_input, crm_type_input, access_token_input, COALESCE(refresh_token_input, ''), expires_at_input, now())
  ON CONFLICT (client_id, crm_type) DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = CASE WHEN EXCLUDED.refresh_token = '' THEN crm_tokens.refresh_token ELSE EXCLUDED.refresh_token END,
    expires_at = EXCLUDED.expires_at,
    connection_status = 'healthy',
    last_error = NULL,
    updated_at = now();
  UPDATE clients SET crm_type = crm_type_input, crm_api_key = NULL WHERE id = client_id_input;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION disconnect_crm(client_id_input uuid, crm_type_input text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_type text;
BEGIN
  SELECT crm_type INTO current_type FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  IF current_type IS NULL THEN RETURN; END IF;
  IF current_type <> crm_type_input THEN RAISE EXCEPTION 'crm mismatch'; END IF;
  DELETE FROM crm_tokens WHERE client_id = client_id_input AND crm_type = crm_type_input;
  UPDATE clients SET crm_type = NULL, crm_api_key = NULL WHERE id = client_id_input;
END;
$$;

CREATE OR REPLACE FUNCTION complete_calendly_oauth(
  client_id_input uuid, access_token_input text, refresh_token_input text, expires_at_input timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF client_id_input IS NULL OR btrim(access_token_input) = '' OR btrim(refresh_token_input) = '' THEN
    RAISE EXCEPTION 'invalid oauth connection data';
  END IF;
  INSERT INTO crm_tokens (client_id, crm_type, access_token, refresh_token, expires_at, connection_status, last_error, updated_at)
  VALUES (client_id_input, 'calendly', access_token_input, refresh_token_input, expires_at_input, 'healthy', NULL, now())
  ON CONFLICT (client_id, crm_type) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at, connection_status = 'healthy', last_error = NULL, updated_at = now();
  UPDATE clients SET calendly_token = access_token_input WHERE id = client_id_input;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION disconnect_calendly(client_id_input uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  DELETE FROM crm_tokens WHERE client_id = client_id_input AND crm_type = 'calendly';
  UPDATE clients SET calendly_token = NULL WHERE id = client_id_input;
END;
$$;

REVOKE ALL ON FUNCTION complete_crm_oauth(uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION disconnect_crm(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_calendly_oauth(uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION disconnect_calendly(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_crm_oauth(uuid,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION disconnect_crm(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION complete_calendly_oauth(uuid,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION disconnect_calendly(uuid) TO service_role;

-- A safe, normalized email is the join key for webhook/session attribution.
UPDATE sessions SET prospect_email = lower(btrim(prospect_email))
WHERE prospect_email IS NOT NULL AND prospect_email <> lower(btrim(prospect_email));

-- Domains are modeled explicitly so the entitlement can be enforced atomically.

CREATE TABLE IF NOT EXISTS client_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, domain)
);
ALTER TABLE client_domains ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE client_domains ADD COLUMN IF NOT EXISTS hostname text;
ALTER TABLE client_domains ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE client_domains ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE client_domains ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE client_domains SET
  origin = CASE
    WHEN domain ~* '^https?://[^/?#]+' THEN lower(regexp_replace(domain, '^(https?://[^/?#]+).*$','\1','i'))
    WHEN domain ~* '^[a-z0-9.-]+(?::[0-9]+)?/?$' THEN 'https://' || lower(rtrim(domain, '/'))
    ELSE NULL
  END,
  hostname = CASE
    WHEN domain ~* '^https?://[^/?#]+' THEN lower(split_part(regexp_replace(domain, '^https?://([^/?#]+).*$','\1','i'), ':', 1))
    WHEN domain ~* '^[a-z0-9.-]+(?::[0-9]+)?/?$' THEN lower(split_part(rtrim(domain, '/'), ':', 1))
    ELSE NULL
  END
WHERE origin IS NULL OR hostname IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_domains_one_primary
  ON client_domains(client_id) WHERE is_primary AND active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_domains_origin ON client_domains(client_id, origin);
INSERT INTO client_domains (client_id, domain, origin, hostname, is_primary, active)
SELECT id, normalized.origin, normalized.origin, normalized.hostname, true, true
FROM clients
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN domain ~* '^https?://[^/?#]+' THEN lower(regexp_replace(domain, '^(https?://[^/?#]+).*$','\1','i'))
      WHEN domain ~* '^[a-z0-9.-]+(?::[0-9]+)?/?$' THEN 'https://' || lower(rtrim(domain, '/'))
    END AS origin,
    CASE
      WHEN domain ~* '^https?://[^/?#]+' THEN lower(split_part(regexp_replace(domain, '^https?://([^/?#]+).*$','\1','i'), ':', 1))
      WHEN domain ~* '^[a-z0-9.-]+(?::[0-9]+)?/?$' THEN lower(split_part(rtrim(domain, '/'), ':', 1))
    END AS hostname
) normalized
WHERE domain IS NOT NULL AND normalized.origin IS NOT NULL AND normalized.hostname IS NOT NULL
ON CONFLICT (client_id, domain) DO UPDATE SET is_primary = true;

CREATE OR REPLACE FUNCTION add_client_domain(client_id_input uuid, origin_input text, hostname_input text)
RETURNS client_domains LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result client_domains; limit_count integer; active_count integer;
BEGIN
  SELECT CASE plan WHEN 'pro' THEN 10 WHEN 'growth' THEN 3 ELSE 1 END
  INTO limit_count FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  SELECT count(*) INTO active_count FROM client_domains WHERE client_id = client_id_input AND active;
  IF active_count >= limit_count THEN RAISE EXCEPTION 'domain limit reached'; END IF;
  INSERT INTO client_domains (client_id, domain, origin, hostname, is_primary, active)
  VALUES (client_id_input, origin_input, origin_input, hostname_input, active_count = 0, true)
  RETURNING * INTO result;
  IF active_count = 0 THEN UPDATE clients SET domain = origin_input WHERE id = client_id_input; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION remove_client_domain(client_id_input uuid, domain_id_input uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE was_primary boolean;
BEGIN
  PERFORM 1 FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  SELECT is_primary INTO was_primary FROM client_domains
  WHERE id = domain_id_input AND client_id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF (SELECT count(*) FROM client_domains WHERE client_id = client_id_input AND active) <= 1 THEN
    RAISE EXCEPTION 'cannot remove final domain';
  END IF;
  DELETE FROM client_domains WHERE id = domain_id_input AND client_id = client_id_input;
  IF was_primary THEN
    UPDATE client_domains SET is_primary = true, updated_at = now()
    WHERE id = (SELECT id FROM client_domains WHERE client_id = client_id_input AND active ORDER BY created_at LIMIT 1);
    UPDATE clients SET domain = (SELECT origin FROM client_domains WHERE client_id = client_id_input AND is_primary AND active LIMIT 1)
    WHERE id = client_id_input;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION set_primary_client_domain(client_id_input uuid, origin_input text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM client_domains WHERE client_id = client_id_input AND origin = origin_input AND active) THEN
    RAISE EXCEPTION 'registered domain not found';
  END IF;
  UPDATE client_domains SET is_primary = false, updated_at = now()
  WHERE client_id = client_id_input AND is_primary;
  UPDATE client_domains SET is_primary = true, updated_at = now()
  WHERE client_id = client_id_input AND origin = origin_input AND active;
  UPDATE clients SET domain = origin_input WHERE id = client_id_input;
END;
$$;

REVOKE ALL ON FUNCTION add_client_domain(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION remove_client_domain(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_primary_client_domain(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_client_domain(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION remove_client_domain(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION set_primary_client_domain(uuid,text) TO service_role;

ALTER TABLE client_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients manage own domains" ON client_domains;
CREATE POLICY "Clients manage own domains" ON client_domains FOR ALL TO authenticated
USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_churnaut_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE company_label text; company_slug text;
BEGIN
  company_label := COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'company_name'), ''), 'Workspace');
  company_slug := LEFT(REGEXP_REPLACE(LOWER(company_label), '[^a-z0-9]', '', 'g'), 40);
  IF company_slug = '' THEN company_slug := 'workspace'; END IF;
  INSERT INTO public.clients (id, company_name, domain, email, plan, active)
  VALUES (NEW.id, company_label, 'https://' || company_slug || '-' || LEFT(NEW.id::text, 8) || '.com', LOWER(NEW.email), 'starter', true)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.client_domains (client_id, domain, origin, hostname, is_primary, active)
  VALUES (NEW.id, 'https://' || company_slug || '-' || LEFT(NEW.id::text, 8) || '.com', 'https://' || company_slug || '-' || LEFT(NEW.id::text, 8) || '.com', company_slug || '-' || LEFT(NEW.id::text, 8) || '.com', true, true)
  ON CONFLICT (client_id, domain) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Public snippet pings are explicit and cannot be confused with webhook events.
CREATE OR REPLACE FUNCTION record_snippet_ping(client_id_input uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE clients SET last_snippet_ping_at = now() WHERE id = client_id_input;
$$;

CREATE OR REPLACE FUNCTION set_session_conversion(client_id_input uuid, session_id_input text, converted_input boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE transitioned boolean := false;
BEGIN
  IF converted_input THEN
    UPDATE sessions SET converted = true, converted_at = COALESCE(converted_at, now())
    WHERE id = session_id_input AND client_id = client_id_input AND converted IS DISTINCT FROM true;
    transitioned := FOUND;
  ELSE
    UPDATE sessions SET converted = false, converted_at = NULL
    WHERE id = session_id_input AND client_id = client_id_input;
  END IF;
  RETURN transitioned;
END;
$$;
REVOKE ALL ON FUNCTION set_session_conversion(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_session_conversion(uuid,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION record_snippet_ping(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_snippet_ping(uuid) TO service_role;
