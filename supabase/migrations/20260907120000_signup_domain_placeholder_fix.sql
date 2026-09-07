-- Do not consume a new workspace's domain allowance with a generated placeholder.
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
  RETURN NEW;
END;
$$;

-- Existing generated placeholders can be replaced by the first real domain.
-- Re-adding an existing active domain is idempotent even at the plan limit.
CREATE OR REPLACE FUNCTION add_client_domain(client_id_input uuid, origin_input text, hostname_input text)
RETURNS client_domains LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result client_domains; limit_count integer; active_count integer;
BEGIN
  SELECT CASE plan WHEN 'pro' THEN 10 WHEN 'growth' THEN 3 ELSE 1 END INTO limit_count
  FROM clients WHERE id = client_id_input FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;

  SELECT * INTO result FROM client_domains
  WHERE client_id = client_id_input AND origin = origin_input AND active;
  IF FOUND THEN RETURN result; END IF;

  DELETE FROM client_domains
  WHERE client_id = client_id_input
    AND is_primary
    AND origin = (SELECT domain FROM clients WHERE id = client_id_input)
    AND origin ~ ('-' || left(client_id_input::text, 8) || '\\.com$');

  SELECT count(*) INTO active_count FROM client_domains WHERE client_id = client_id_input AND active;
  IF active_count >= limit_count THEN RAISE EXCEPTION 'domain limit reached'; END IF;
  INSERT INTO client_domains (client_id, domain, origin, hostname, is_primary, active)
  VALUES (client_id_input, origin_input, origin_input, hostname_input, active_count = 0, true)
  RETURNING * INTO result;
  IF active_count = 0 THEN UPDATE clients SET domain = origin_input WHERE id = client_id_input; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION add_client_domain(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_client_domain(uuid,text,text) TO service_role;
