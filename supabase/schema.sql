-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Keep pgvector objects out of the public schema on fresh installations.
-- Supabase ships this extension; placing it in a dedicated schema avoids
-- exposing extension implementation objects through the public API surface.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- If a fresh baseline is applied to a database where pgvector already exists
-- in public, converge it on the same dedicated schema used by migrations.
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

-- ==========================================
-- 1. CLIENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    company_name text NOT NULL,
    domain text NOT NULL UNIQUE,
    plan text DEFAULT 'starter',
    plan_status text DEFAULT 'active',
    monthly_visits integer DEFAULT 0,
    snippet_key text UNIQUE DEFAULT gen_random_uuid()::text,
    webhook_secret uuid DEFAULT gen_random_uuid(),
    webhook_query_auth_expires_at timestamptz,
    webhook_previous_secret uuid,
    webhook_previous_secret_expires_at timestamptz,
    email text,
    crm_type text,
    crm_api_key text,
    calendly_token text,
    stripe_customer_id text,
    lemonsqueezy_customer_id text,
    lemonsqueezy_subscription_id text,
    lemonsqueezy_variant_id text,
    trial_ends_at timestamptz,
    visits_reset_at timestamptz,
    last_snippet_ping_at timestamptz,
    active boolean DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_webhook_secret_unique
  ON clients (webhook_secret) WHERE webhook_secret IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_webhook_previous_secret_idx
  ON clients (webhook_previous_secret) WHERE webhook_previous_secret IS NOT NULL;

-- Provision the tenant row inside the same transaction as the Supabase Auth
-- user. A profile failure aborts sign-up, preventing orphaned auth accounts.
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
        'https://' || company_slug || '-' || LEFT(NEW.id::text, 8) || '.com',
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

-- ==========================================
-- 2. SESSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz,
    prospect_name text,
    prospect_email text,
    company_name text,
    job_title text,
    signal_type text,
    assigned_rep text,
    calendar_url text,
    crm_deal_id text,
    deal_stage text,
    visitor_type text,
    clicked_at timestamptz,
    click_count integer DEFAULT 0,
    converted boolean DEFAULT false,
    converted_at timestamptz,
    visitor_token text UNIQUE
    ,destination_url text
    ,session_kind text NOT NULL DEFAULT 'tracked_link'
    ,metadata jsonb NOT NULL DEFAULT '{}'
    ,CONSTRAINT sessions_session_kind_check CHECK (session_kind IN ('tracked_link', 'anonymous_visit', 'webhook'))
);

CREATE TABLE IF NOT EXISTS client_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    domain text NOT NULL,
    origin text NOT NULL,
    hostname text NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    verified_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(client_id, domain)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_domains_one_primary
  ON client_domains(client_id) WHERE is_primary AND active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_domains_origin ON client_domains(client_id, origin);

-- ==========================================
-- 3. ROUTING RULES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS routing_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    priority integer NOT NULL,
    active boolean DEFAULT true,
    signal_type text,
    conditions jsonb DEFAULT '{}',
    action_type text NOT NULL,
    action_payload jsonb DEFAULT '{}',
    target_selector text,
    variant_content text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ==========================================
-- 4. ANALYTICS EVENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS analytics_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    session_id text REFERENCES sessions(id) ON DELETE SET NULL,
    rule_id uuid REFERENCES routing_rules(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    signal_type text,
    created_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
CREATE INDEX IF NOT EXISTS idx_clients_lower_email ON clients (lower(email));
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_client_id ON routing_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority ON routing_rules(client_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_id ON analytics_events(client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_client_created ON sessions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_email_lower ON sessions(client_id, lower(prospect_email));
CREATE INDEX IF NOT EXISTS idx_events_client_type_created ON analytics_events(client_id, event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_one_conversion
    ON analytics_events(client_id, session_id)
    WHERE event_type = 'conversion' AND session_id IS NOT NULL;

-- Atomic quota consumption used by the public resolve endpoint.
CREATE OR REPLACE FUNCTION increment_monthly_visits_if_available(
    client_id_input UUID,
    visit_limit_input INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE clients
    SET monthly_visits = COALESCE(monthly_visits, 0) + 1
    WHERE id = client_id_input
      AND COALESCE(monthly_visits, 0) < visit_limit_input;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION increment_click_count(session_id_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
    INSERT INTO analytics_events (client_id, session_id, event_type, signal_type, metadata)
    SELECT client_id_input, id, 'conversion', COALESCE(signal_type, 'crm_webhook'), '{"schema_version":2}'::jsonb
    FROM sessions WHERE id = session_id_input AND client_id = client_id_input AND converted = true
    ON CONFLICT (client_id, session_id) WHERE event_type = 'conversion' AND session_id IS NOT NULL DO NOTHING;
  ELSE
    UPDATE sessions SET converted = false, converted_at = NULL WHERE id = session_id_input AND client_id = client_id_input;
  END IF;
  RETURN transitioned;
END;
$$;

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

CREATE OR REPLACE FUNCTION analytics_v2_aggregate(client_id_input uuid, from_date_input timestamptz, month_start_input timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH
  client_sessions AS (SELECT * FROM sessions WHERE client_id = client_id_input AND session_kind <> 'webhook'),
  window_sessions AS (SELECT * FROM client_sessions WHERE created_at >= from_date_input),
  window_events AS (SELECT * FROM analytics_events WHERE client_id = client_id_input AND created_at >= from_date_input),
  page_sessions AS (SELECT DISTINCT session_id FROM window_events WHERE event_type = 'page_view' AND session_id IS NOT NULL),
  personalized_sessions AS (SELECT DISTINCT event.session_id FROM window_events event JOIN page_sessions page USING (session_id) WHERE event.event_type = 'rule_triggered'),
  converted_sessions AS (SELECT session_id, min(created_at) converted_at FROM window_events WHERE event_type = 'conversion' AND session_id IS NOT NULL GROUP BY session_id),
  attributed AS (
    SELECT conversion.session_id, trigger.rule_id FROM converted_sessions conversion
    JOIN LATERAL (SELECT rule_id FROM analytics_events WHERE client_id = client_id_input AND session_id = conversion.session_id AND event_type = 'rule_triggered' AND rule_id IS NOT NULL AND created_at <= conversion.converted_at ORDER BY created_at DESC LIMIT 1) trigger ON true
  ),
  link_counts AS (SELECT COALESCE(signal_type, 'Outbound Link') signal, count(*)::int links FROM window_sessions WHERE session_kind = 'tracked_link' GROUP BY 1),
  click_counts AS (SELECT COALESCE(signal_type, 'Outbound Link') signal, count(*)::int clicks FROM window_events WHERE event_type = 'link_clicked' GROUP BY 1),
  conversion_counts AS (SELECT COALESCE(event.signal_type, session.signal_type, 'Outbound Link') signal, count(DISTINCT event.session_id)::int conversions FROM window_events event LEFT JOIN client_sessions session ON session.id = event.session_id WHERE event.event_type = 'conversion' GROUP BY 1),
  signals AS (SELECT COALESCE(link.signal, click.signal, conversion.signal) signal, COALESCE(link.links, 0) links, COALESCE(click.clicks, 0) clicks, COALESCE(conversion.conversions, 0) conversions FROM link_counts link FULL JOIN click_counts click USING (signal) FULL JOIN conversion_counts conversion ON conversion.signal = COALESCE(link.signal, click.signal)),
  rep_links AS (SELECT assigned_rep rep, count(*)::int links FROM window_sessions WHERE assigned_rep IS NOT NULL AND session_kind = 'tracked_link' GROUP BY assigned_rep),
  rep_conversions AS (SELECT session.assigned_rep rep, count(DISTINCT conversion.session_id)::int conversions FROM converted_sessions conversion JOIN client_sessions session ON session.id = conversion.session_id WHERE session.assigned_rep IS NOT NULL GROUP BY session.assigned_rep),
  reps AS (SELECT COALESCE(link.rep, conversion.rep) rep, COALESCE(link.links, 0) links, COALESCE(conversion.conversions, 0) conversions FROM rep_links link FULL JOIN rep_conversions conversion USING (rep)),
  rule_triggers AS (SELECT rule_id, count(*)::int triggers FROM (SELECT DISTINCT rule_id, session_id FROM window_events WHERE event_type = 'rule_triggered' AND rule_id IS NOT NULL AND session_id IS NOT NULL) x GROUP BY rule_id),
  rule_conversions AS (SELECT rule_id, count(*)::int conversions FROM attributed GROUP BY rule_id),
  rule_metrics AS (SELECT COALESCE(trigger.rule_id, conversion.rule_id) rule_id, COALESCE(trigger.triggers, 0) triggers, COALESCE(conversion.conversions, 0) conversions FROM rule_triggers trigger FULL JOIN rule_conversions conversion USING (rule_id)),
  daily AS (SELECT created_at::date day, count(*)::int count FROM window_events WHERE event_type = 'page_view' GROUP BY created_at::date ORDER BY day),
  controls AS (SELECT (SELECT count(*) FROM personalized_sessions)::int personalized, (SELECT count(*) FROM page_sessions page WHERE NOT EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = page.session_id))::int unpersonalized, (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = conversion.session_id))::int personalized_converted, (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM page_sessions page WHERE page.session_id = conversion.session_id) AND NOT EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = conversion.session_id))::int unpersonalized_converted),
  rule_lift AS (SELECT trigger.rule_id, count(*)::int personalized_sessions, count(*) FILTER (WHERE conversion.session_id IS NOT NULL)::int conversions FROM (SELECT DISTINCT rule_id, session_id FROM window_events WHERE event_type = 'rule_triggered' AND rule_id IS NOT NULL AND session_id IS NOT NULL) trigger LEFT JOIN converted_sessions conversion USING (session_id) GROUP BY trigger.rule_id)
SELECT jsonb_build_object(
  'summaryStats', jsonb_build_object('totalLinksCreatedThisMonth', (SELECT count(*) FROM client_sessions WHERE session_kind = 'tracked_link' AND created_at >= month_start_input), 'totalClicksThisMonth', (SELECT count(*) FROM analytics_events WHERE client_id = client_id_input AND event_type = 'link_clicked' AND created_at >= month_start_input), 'personalizationTriggerRate', CASE WHEN (SELECT count(*) FROM page_sessions) = 0 THEN 0 ELSE round(100.0 * (SELECT count(*) FROM personalized_sessions) / (SELECT count(*) FROM page_sessions)) END, 'overallConversionRate', CASE WHEN (SELECT count(*) FROM page_sessions) = 0 THEN 0 ELSE round(100.0 * (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM page_sessions page WHERE page.session_id = conversion.session_id)) / (SELECT count(*) FROM page_sessions)) END),
  'signalBreakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object('signal', signal, 'links', links, 'clicks', clicks, 'conversions', conversions, 'conversion_rate', CASE WHEN links = 0 THEN 0 ELSE round(100.0 * conversions / links) END) ORDER BY signal) FROM signals), '[]'::jsonb),
  'repPerformance', COALESCE((SELECT jsonb_agg(jsonb_build_object('rep', rep, 'links', links, 'conversions', conversions, 'conversion_rate', CASE WHEN links = 0 THEN 0 ELSE round(100.0 * conversions / links) END) ORDER BY rep) FROM reps), '[]'::jsonb),
  'rulePerformance', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_id', rule_id, 'triggers', triggers, 'conversions', conversions, 'conversion_rate', CASE WHEN triggers = 0 THEN 0 ELSE round(100.0 * conversions / triggers) END)) FROM rule_metrics), '[]'::jsonb),
  'dailyVolume', COALESCE((SELECT jsonb_agg(jsonb_build_object('rawDate', day::text, 'count', count) ORDER BY day) FROM daily), '[]'::jsonb),
  'liftReport', (SELECT jsonb_build_object('personalized_sessions', personalized, 'unpersonalized_sessions', unpersonalized, 'personalized_rate', CASE WHEN personalized = 0 THEN 0 ELSE round(100.0 * personalized_converted / personalized) END, 'baseline_rate', CASE WHEN unpersonalized = 0 THEN 0 ELSE round(100.0 * unpersonalized_converted / unpersonalized) END, 'overall_lift_pp', (CASE WHEN personalized = 0 THEN 0 ELSE round(100.0 * personalized_converted / personalized) END) - (CASE WHEN unpersonalized = 0 THEN 0 ELSE round(100.0 * unpersonalized_converted / unpersonalized) END), 'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_id', rule_id, 'personalized_sessions', personalized_sessions, 'personalized_rate', CASE WHEN personalized_sessions = 0 THEN 0 ELSE round(100.0 * conversions / personalized_sessions) END)) FROM rule_lift), '[]'::jsonb)) FROM controls)
);
$$;

-- Exact, event-timed weekly digest metrics. The API consumes this RPC instead
-- of capped PostgREST row lists or mutable lifetime counters on sessions.
CREATE OR REPLACE FUNCTION digest_v2_aggregate(
  client_id_input uuid,
  current_start_input timestamptz,
  previous_start_input timestamptz,
  period_end_input timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH
  period_bounds(period, starts_at, ends_at) AS (
    VALUES
      ('current'::text, current_start_input, period_end_input),
      ('previous'::text, previous_start_input, current_start_input)
  ),
  period_events AS (
    SELECT
      CASE WHEN event.created_at >= current_start_input THEN 'current' ELSE 'previous' END AS period,
      event.session_id,
      event.rule_id,
      event.event_type,
      event.signal_type,
      event.created_at
    FROM analytics_events event
    WHERE event.client_id = client_id_input
      AND event.created_at >= previous_start_input
      AND event.created_at < period_end_input
      AND event.event_type IN ('page_view', 'link_clicked', 'conversion', 'rule_triggered')
  ),
  page_sessions AS (
    SELECT DISTINCT ON (event.period, event.session_id)
      event.period,
      event.session_id,
      COALESCE(event.signal_type, session.signal_type, 'Any') AS signal
    FROM period_events event
    LEFT JOIN sessions session
      ON session.id = event.session_id AND session.client_id = client_id_input
    WHERE event.event_type = 'page_view' AND event.session_id IS NOT NULL
    ORDER BY event.period, event.session_id, event.created_at
  ),
  conversion_sessions AS (
    SELECT DISTINCT event.period, event.session_id
    FROM period_events event
    WHERE event.event_type = 'conversion' AND event.session_id IS NOT NULL
  ),
  signal_stats AS (
    SELECT
      page.period,
      page.signal,
      count(*)::int AS total,
      count(conversion.session_id)::int AS converted,
      CASE WHEN count(*) = 0 THEN 0
        ELSE count(conversion.session_id)::numeric / count(*)
      END AS rate
    FROM page_sessions page
    LEFT JOIN conversion_sessions conversion
      ON conversion.period = page.period AND conversion.session_id = page.session_id
    GROUP BY page.period, page.signal
  ),
  rep_stats AS (
    SELECT
      conversion.period,
      session.assigned_rep AS rep,
      count(*)::int AS conversions
    FROM conversion_sessions conversion
    JOIN sessions session
      ON session.id = conversion.session_id AND session.client_id = client_id_input
    WHERE session.assigned_rep IS NOT NULL
    GROUP BY conversion.period, session.assigned_rep
  ),
  rule_stats AS (
    SELECT event.period, event.rule_id, count(*)::int AS triggers
    FROM period_events event
    WHERE event.event_type = 'rule_triggered' AND event.rule_id IS NOT NULL
    GROUP BY event.period, event.rule_id
  ),
  period_payloads AS (
    SELECT
      bounds.period,
      jsonb_build_object(
        'links_created', (
          SELECT count(*)::int FROM sessions session
          WHERE session.client_id = client_id_input
            AND session.session_kind = 'tracked_link'
            AND session.created_at >= bounds.starts_at
            AND session.created_at < bounds.ends_at
        ),
        'clicks', (
          SELECT count(*)::int FROM period_events event
          WHERE event.period = bounds.period AND event.event_type = 'link_clicked'
        ),
        'conversions', (
          SELECT count(*)::int FROM conversion_sessions conversion
          WHERE conversion.period = bounds.period
        ),
        'triggers', (
          SELECT count(*)::int FROM period_events event
          WHERE event.period = bounds.period AND event.event_type = 'rule_triggered'
        ),
        'signals', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'signal', signal.signal,
            'total', signal.total,
            'converted', signal.converted,
            'rate', signal.rate
          ) ORDER BY signal.rate DESC, signal.converted DESC, signal.total DESC, signal.signal)
          FROM signal_stats signal WHERE signal.period = bounds.period
        ), '[]'::jsonb),
        'reps', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'rep', rep.rep,
            'conversions', rep.conversions
          ) ORDER BY rep.conversions DESC, rep.rep)
          FROM rep_stats rep WHERE rep.period = bounds.period
        ), '[]'::jsonb),
        'rules', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'rule_id', rule.rule_id,
            'triggers', rule.triggers
          ) ORDER BY rule.triggers DESC, rule.rule_id)
          FROM rule_stats rule WHERE rule.period = bounds.period
        ), '[]'::jsonb)
      ) AS payload
    FROM period_bounds bounds
  )
SELECT jsonb_build_object(
  'current', COALESCE((SELECT payload FROM period_payloads WHERE period = 'current'), '{}'::jsonb),
  'previous', COALESCE((SELECT payload FROM period_payloads WHERE period = 'previous'), '{}'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION anomaly_v2_aggregate(
  client_id_input uuid,
  current_start_input timestamptz,
  previous_start_input timestamptz,
  period_end_input timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH
  period_events AS (
    SELECT
      CASE WHEN event.created_at >= current_start_input THEN 'current' ELSE 'previous' END AS period,
      event.session_id,
      event.rule_id,
      event.event_type,
      event.created_at
    FROM analytics_events event
    WHERE event.client_id = client_id_input
      AND event.created_at >= previous_start_input
      AND event.created_at < period_end_input
      AND event.event_type IN ('page_view', 'conversion', 'rule_triggered')
  ),
  page_sessions AS (
    SELECT DISTINCT event.period, event.session_id
    FROM period_events event
    WHERE event.event_type = 'page_view' AND event.session_id IS NOT NULL
  ),
  conversion_sessions AS (
    SELECT DISTINCT event.period, event.session_id
    FROM period_events event
    WHERE event.event_type = 'conversion' AND event.session_id IS NOT NULL
  ),
  period_stats AS (
    SELECT
      period.period,
      count(page.session_id)::int AS visitors,
      count(conversion.session_id)::int AS conversions,
      CASE WHEN count(page.session_id) = 0 THEN 0
        ELSE count(conversion.session_id)::numeric / count(page.session_id)
      END AS rate
    FROM (VALUES ('current'::text), ('previous'::text)) period(period)
    LEFT JOIN page_sessions page ON page.period = period.period
    LEFT JOIN conversion_sessions conversion
      ON conversion.period = page.period AND conversion.session_id = page.session_id
    GROUP BY period.period
  ),
  rule_daily AS (
    SELECT
      event.rule_id,
      (event.created_at AT TIME ZONE 'UTC')::date AS day,
      count(*)::int AS count
    FROM period_events event
    WHERE event.period = 'current'
      AND event.event_type = 'rule_triggered'
      AND event.rule_id IS NOT NULL
    GROUP BY event.rule_id, (event.created_at AT TIME ZONE 'UTC')::date
  )
SELECT jsonb_build_object(
  'current', COALESCE((
    SELECT jsonb_build_object('visitors', visitors, 'conversions', conversions, 'rate', rate)
    FROM period_stats WHERE period = 'current'
  ), '{"visitors":0,"conversions":0,"rate":0}'::jsonb),
  'previous', COALESCE((
    SELECT jsonb_build_object('visitors', visitors, 'conversions', conversions, 'rate', rate)
    FROM period_stats WHERE period = 'previous'
  ), '{"visitors":0,"conversions":0,"rate":0}'::jsonb),
  'rule_daily', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'rule_id', rule_id,
      'day', day::text,
      'count', count
    ) ORDER BY day, rule_id)
    FROM rule_daily
  ), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION replace_routing_rules(client_id_input UUID, rules_input JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION reorder_routing_rules(client_id_input uuid, rules_input jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE requested_count integer; matched_count integer; updated_count integer;
BEGIN
  IF jsonb_typeof(rules_input) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'rules_input must be an array';
  END IF;
  SELECT count(*) INTO requested_count FROM jsonb_array_elements(rules_input);
  IF requested_count = 0 THEN RETURN 0; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    GROUP BY item.id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    GROUP BY item.priority HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    WHERE item.id IS NULL OR item.priority IS NULL OR item.priority < 1
  ) THEN
    RAISE EXCEPTION 'rule ids and positive priorities must be unique';
  END IF;
  SELECT count(*) INTO matched_count
  FROM routing_rules rule
  JOIN jsonb_to_recordset(rules_input) AS item(id uuid, priority integer) ON item.id = rule.id
  WHERE rule.client_id = client_id_input;
  IF matched_count <> requested_count THEN
    RAISE EXCEPTION 'one or more routing rules do not belong to this client';
  END IF;
  UPDATE routing_rules rule
  SET priority = item.priority, updated_at = now()
  FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
  WHERE rule.id = item.id AND rule.client_id = client_id_input;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION delete_routing_rule_and_resequence(client_id_input uuid, rule_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE deleted boolean := false;
BEGIN
  DELETE FROM routing_rules WHERE id = rule_id_input AND client_id = client_id_input;
  deleted := FOUND;
  IF NOT deleted THEN RETURN false; END IF;
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY priority, created_at, id)::integer AS next_priority
    FROM routing_rules WHERE client_id = client_id_input
  )
  UPDATE routing_rules rule
  SET priority = ranked.next_priority, updated_at = now()
  FROM ranked
  WHERE rule.id = ranked.id AND rule.priority IS DISTINCT FROM ranked.next_priority;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_churnaut_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_click_count(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_snippet_ping(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_session_conversion(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION add_client_domain(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION remove_client_domain(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_primary_client_domain(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION digest_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION anomaly_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION replace_routing_rules(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reorder_routing_rules(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_routing_rule_and_resequence(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_click_count(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_snippet_ping(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION set_session_conversion(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION add_client_domain(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION remove_client_domain(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION set_primary_client_domain(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION digest_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION anomaly_v2_aggregate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION replace_routing_rules(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION reorder_routing_rules(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION delete_routing_rule_and_resequence(UUID, UUID) TO service_role;

-- ==========================================
-- 4A. PROCESSED WEBHOOKS (IDEMPOTENCY)
-- ==========================================
CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id text PRIMARY KEY,
    processed_at timestamptz DEFAULT now(),
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
    claimed_at timestamptz,
    completed_at timestamptz,
    attempts integer NOT NULL DEFAULT 1,
    last_error text
);

-- ==========================================
-- 4B. LLM LOGS (SERVICE-ROLE ONLY)
-- ==========================================
CREATE TABLE IF NOT EXISTS llm_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    session_id text,
    deal_id text,
    feature text NOT NULL,
    model_used text NOT NULL,
    prompt_version text DEFAULT 'v1.0',
    system_prompt text,
    input_payload jsonb NOT NULL,
    output_payload jsonb NOT NULL,
    latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    feedback_score integer,
    feedback_type text,
    feedback_edited_output jsonb,
    feedback_at timestamptz,
    feedback_source text
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_client_id ON llm_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_feature ON llm_logs(feature);
CREATE INDEX IF NOT EXISTS idx_llm_logs_created_at ON llm_logs(created_at DESC);
ALTER TABLE llm_logs ENABLE ROW LEVEL SECURITY;

-- AI cost/reliability controls (authoritative baseline; apply the ordered migration for upgrades).
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'interaction';
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS attempt integer;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS estimated_cost_micros bigint;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS usage_source text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS finish_reason text;
ALTER TABLE llm_logs ALTER COLUMN input_payload SET DEFAULT '{}'::jsonb;
ALTER TABLE llm_logs ALTER COLUMN output_payload SET DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS ai_plan_limits (plan text PRIMARY KEY, monthly_cost_limit_micros bigint NOT NULL, monthly_token_limit bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO ai_plan_limits(plan,monthly_cost_limit_micros,monthly_token_limit) VALUES ('starter',10000000,2000000),('growth',50000000,10000000),('pro',200000000,40000000) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ai_client_limit_overrides (client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE, monthly_cost_limit_micros bigint, monthly_token_limit bigint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_model_pricing (provider text NOT NULL, model text NOT NULL, input_cost_micros_per_million_tokens bigint, output_cost_micros_per_million_tokens bigint, verified_at timestamptz, active boolean NOT NULL DEFAULT true, PRIMARY KEY(provider,model));
CREATE TABLE IF NOT EXISTS ai_usage_monthly (client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE, month_start date NOT NULL, reserved_cost_micros bigint NOT NULL DEFAULT 0, estimated_cost_micros bigint NOT NULL DEFAULT 0, reserved_tokens bigint NOT NULL DEFAULT 0, input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, successful_attempts integer NOT NULL DEFAULT 0, failed_attempts integer NOT NULL DEFAULT 0, denied_attempts integer NOT NULL DEFAULT 0, expired_reservations integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(client_id,month_start));
CREATE TABLE IF NOT EXISTS ai_budget_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE, request_id uuid NOT NULL UNIQUE, feature text NOT NULL, provider text NOT NULL, model text NOT NULL, month_start date NOT NULL, reserved_cost_micros bigint NOT NULL DEFAULT 0, reserved_tokens bigint NOT NULL, status text NOT NULL DEFAULT 'reserved', expires_at timestamptz NOT NULL DEFAULT(now()+interval '10 minutes'), created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz);
ALTER TABLE ai_plan_limits ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_client_limit_overrides ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_usage_monthly ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_budget_reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_llm_logs_record_type_created ON llm_logs(record_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_client_created ON llm_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_status_created ON llm_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_provider_model_created ON llm_logs(provider, model_used, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_request_id ON llm_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_monthly_client ON ai_usage_monthly(client_id, month_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reservations_expiry ON ai_budget_reservations(status, expires_at);
INSERT INTO ai_model_pricing(provider,model) VALUES ('together','moonshotai/Kimi-K2.6') ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_plan_limits_plan_check') THEN ALTER TABLE ai_plan_limits ADD CONSTRAINT ai_plan_limits_plan_check CHECK (plan IN ('starter','growth','pro')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_budget_reservations_status_check') THEN ALTER TABLE ai_budget_reservations ADD CONSTRAINT ai_budget_reservations_status_check CHECK (status IN ('reserved','settled','released','expired_charged')); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_ai_budget(client_id_input uuid, feature_input text, request_id_input uuid, provider_input text, model_input text, estimated_input_tokens bigint, max_output_tokens bigint, enforce_input boolean DEFAULT false)
RETURNS TABLE(allowed boolean, reservation_id uuid, reserved_cost_micros bigint, reserved_tokens bigint, remaining_cost_micros bigint, remaining_tokens bigint, denial_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE plan_name text; cost_limit bigint; token_limit bigint; month_value date:=date_trunc('month',now())::date; price_in bigint; price_out bigint; cost_value bigint:=0; usage_row ai_usage_monthly%ROWTYPE; existing ai_budget_reservations%ROWTYPE; projected_cost bigint; projected_tokens bigint; stale_cost bigint:=0; stale_tokens bigint:=0; stale_count integer:=0;
BEGIN
 SELECT plan INTO plan_name FROM clients WHERE id=client_id_input; IF plan_name IS NULL THEN plan_name:='starter'; END IF;
 SELECT COALESCE(o.monthly_cost_limit_micros,p.monthly_cost_limit_micros),COALESCE(o.monthly_token_limit,p.monthly_token_limit) INTO cost_limit,token_limit FROM ai_plan_limits p LEFT JOIN ai_client_limit_overrides o ON o.client_id=client_id_input WHERE p.plan=CASE WHEN plan_name IN('starter','growth','pro') THEN plan_name ELSE 'starter' END;
 SELECT * INTO existing FROM ai_budget_reservations WHERE request_id=request_id_input; IF existing.id IS NOT NULL AND existing.status='reserved' THEN RETURN QUERY SELECT true,existing.id,existing.reserved_cost_micros,existing.reserved_tokens,GREATEST(0,cost_limit-existing.reserved_cost_micros),GREATEST(0,token_limit-existing.reserved_tokens),NULL::text; RETURN; END IF;
 SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO price_in,price_out FROM ai_model_pricing WHERE provider=provider_input AND model=model_input AND active; IF price_in IS NOT NULL AND price_out IS NOT NULL THEN cost_value:=ceil((estimated_input_tokens*price_in+max_output_tokens*price_out)::numeric/1000000); END IF;
 INSERT INTO ai_usage_monthly(client_id,month_start) VALUES(client_id_input,month_value) ON CONFLICT DO NOTHING; SELECT * INTO usage_row FROM ai_usage_monthly WHERE client_id=client_id_input AND month_start=month_value FOR UPDATE;
 SELECT COALESCE(sum(reserved_cost_micros),0),COALESCE(sum(reserved_tokens),0),count(*) INTO stale_cost,stale_tokens,stale_count FROM ai_budget_reservations WHERE client_id=client_id_input AND month_start=month_value AND status='reserved' AND expires_at<now();
 IF stale_count>0 THEN UPDATE ai_budget_reservations SET status='expired_charged',settled_at=now() WHERE client_id=client_id_input AND month_start=month_value AND status='reserved' AND expires_at<now(); UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-stale_cost),reserved_tokens=GREATEST(0,reserved_tokens-stale_tokens),estimated_cost_micros=estimated_cost_micros+stale_cost,input_tokens=input_tokens+stale_tokens,expired_reservations=expired_reservations+stale_count,failed_attempts=failed_attempts+stale_count,updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; usage_row.reserved_cost_micros:=GREATEST(0,usage_row.reserved_cost_micros-stale_cost); usage_row.reserved_tokens:=GREATEST(0,usage_row.reserved_tokens-stale_tokens); usage_row.estimated_cost_micros:=usage_row.estimated_cost_micros+stale_cost; usage_row.input_tokens:=usage_row.input_tokens+stale_tokens; END IF;
 projected_cost:=usage_row.estimated_cost_micros+usage_row.reserved_cost_micros+cost_value; projected_tokens:=usage_row.input_tokens+usage_row.output_tokens+usage_row.reserved_tokens+estimated_input_tokens+max_output_tokens;
 IF enforce_input AND (price_in IS NULL OR price_out IS NULL) THEN UPDATE ai_usage_monthly SET denied_attempts=denied_attempts+1,updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; RETURN QUERY SELECT false,NULL::uuid,0::bigint,0::bigint,GREATEST(0,cost_limit-projected_cost),GREATEST(0,token_limit-projected_tokens),'pricing_missing'; RETURN; END IF;
 IF enforce_input AND (projected_cost>cost_limit OR projected_tokens>token_limit) THEN UPDATE ai_usage_monthly SET denied_attempts=denied_attempts+1,updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; RETURN QUERY SELECT false,NULL::uuid,cost_value,estimated_input_tokens+max_output_tokens,GREATEST(0,cost_limit-(projected_cost-cost_value)),GREATEST(0,token_limit-(projected_tokens-estimated_input_tokens-max_output_tokens)),'budget_exceeded'; RETURN; END IF;
 INSERT INTO ai_budget_reservations(client_id,request_id,feature,provider,model,month_start,reserved_cost_micros,reserved_tokens) VALUES(client_id_input,request_id_input,feature_input,provider_input,model_input,month_value,cost_value,estimated_input_tokens+max_output_tokens) RETURNING * INTO existing; UPDATE ai_usage_monthly SET reserved_cost_micros=reserved_cost_micros+cost_value,reserved_tokens=reserved_tokens+existing.reserved_tokens,updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; RETURN QUERY SELECT true,existing.id,cost_value,existing.reserved_tokens,GREATEST(0,cost_limit-projected_cost),GREATEST(0,token_limit-projected_tokens),NULL::text;
END; $$;
CREATE OR REPLACE FUNCTION public.settle_ai_budget_legacy(reservation_id_input uuid,input_tokens_input bigint,output_tokens_input bigint,status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r ai_budget_reservations%ROWTYPE; price_in bigint; price_out bigint; actual_cost bigint:=0; charged_input bigint; charged_output bigint; BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status<>'reserved' THEN RETURN false; END IF; charged_input:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens ELSE GREATEST(0,input_tokens_input) END; charged_output:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO price_in,price_out FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF price_in IS NOT NULL AND price_out IS NOT NULL THEN actual_cost:=ceil((GREATEST(0,input_tokens_input)*price_in+GREATEST(0,output_tokens_input)*price_out)::numeric/1000000); END IF; IF status_input='expired_charged' THEN actual_cost:=GREATEST(actual_cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input,settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros),reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens),input_tokens=input_tokens+charged_input,output_tokens=output_tokens+charged_output,estimated_cost_micros=estimated_cost_micros+actual_cost,successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END,failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END,updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;
CREATE OR REPLACE FUNCTION public.get_ai_cost_dashboard_legacy(month_start_input date DEFAULT date_trunc('month',now())::date) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '{}'::jsonb; $$;
CREATE OR REPLACE FUNCTION public.get_ai_cost_dashboard(month_start_input date DEFAULT date_trunc('month',now())::date) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT jsonb_build_object('month_start',month_start_input,'usage',COALESCE((SELECT jsonb_build_object('estimated_cost_micros',COALESCE(sum(estimated_cost_micros),0),'input_tokens',COALESCE(sum(input_tokens),0),'output_tokens',COALESCE(sum(output_tokens),0),'denied_attempts',COALESCE(sum(denied_attempts),0),'expired_reservations',COALESCE(sum(expired_reservations),0)) FROM ai_usage_monthly WHERE month_start=month_start_input),'{}'::jsonb),'by_client',COALESCE((SELECT jsonb_agg(x) FROM (SELECT c.id,c.company_name,c.plan,COALESCE(u.estimated_cost_micros,0) estimated_cost_micros,COALESCE(u.input_tokens,0) input_tokens,COALESCE(u.output_tokens,0) output_tokens,COALESCE(u.denied_attempts,0) denied_attempts,COALESCE(o.monthly_cost_limit_micros,p.monthly_cost_limit_micros) cost_limit_micros,COALESCE(o.monthly_token_limit,p.monthly_token_limit) token_limit FROM clients c LEFT JOIN ai_usage_monthly u ON u.client_id=c.id AND u.month_start=month_start_input LEFT JOIN ai_plan_limits p ON p.plan=CASE WHEN c.plan IN('starter','growth','pro') THEN c.plan ELSE 'starter' END LEFT JOIN ai_client_limit_overrides o ON o.client_id=c.id ORDER BY estimated_cost_micros DESC)x),'[]'::jsonb),'by_feature',COALESCE((SELECT jsonb_agg(x) FROM (SELECT feature,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros,sum(COALESCE(input_tokens,0)) input_tokens,sum(COALESCE(output_tokens,0)) output_tokens,count(*) FILTER(WHERE status<>'success') errors,count(*) FILTER(WHERE fallback_used) fallbacks,count(*) FILTER(WHERE usage_source='pricing_missing') unpriced,count(*) FILTER(WHERE status='timeout') timeouts FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input+interval '1 month') GROUP BY feature ORDER BY estimated_cost_micros DESC)x),'[]'::jsonb),'by_model',COALESCE((SELECT jsonb_agg(x) FROM (SELECT provider,model_used,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros,count(*) FILTER(WHERE status<>'success') errors FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input+interval '1 month') GROUP BY provider,model_used)x),'[]'::jsonb)); $$;
REVOKE ALL ON FUNCTION public.get_ai_cost_dashboard_legacy(date) FROM PUBLIC,anon,authenticated;
DROP FUNCTION IF EXISTS public.get_ai_cost_dashboard_legacy(date);
CREATE OR REPLACE FUNCTION public.settle_ai_budget(reservation_id_input uuid,input_tokens_input bigint,output_tokens_input bigint,status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r ai_budget_reservations%ROWTYPE; price_in bigint; price_out bigint; actual_cost bigint:=0; charged_input bigint; charged_output bigint; BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status<>'reserved' THEN RETURN false; END IF; charged_input:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens WHEN status_input='settled' THEN GREATEST(0,input_tokens_input) ELSE 0 END; charged_output:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO price_in,price_out FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF price_in IS NOT NULL AND price_out IS NOT NULL THEN actual_cost:=ceil((GREATEST(0,input_tokens_input)*price_in+GREATEST(0,output_tokens_input)*price_out)::numeric/1000000); END IF; IF status_input='expired_charged' THEN actual_cost:=GREATEST(actual_cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input,settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros),reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens),input_tokens=input_tokens+charged_input,output_tokens=output_tokens+charged_output,estimated_cost_micros=estimated_cost_micros+actual_cost,successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END,failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END,updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;
CREATE OR REPLACE FUNCTION public.settle_ai_budget(reservation_id_input uuid,input_tokens_input bigint,output_tokens_input bigint,status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE r ai_budget_reservations%ROWTYPE; pi bigint; po bigint; cost bigint:=0; ci bigint; co bigint; BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status<>'reserved' THEN RETURN false; END IF; ci:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens WHEN status_input='settled' THEN GREATEST(0,input_tokens_input) ELSE 0 END; co:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO pi,po FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF status_input<>'released' AND pi IS NOT NULL AND po IS NOT NULL THEN cost:=ceil((GREATEST(0,input_tokens_input)*pi+GREATEST(0,output_tokens_input)*po)::numeric/1000000); END IF; IF status_input='expired_charged' THEN cost:=GREATEST(cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input,settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros),reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens),input_tokens=input_tokens+ci,output_tokens=output_tokens+co,estimated_cost_micros=estimated_cost_micros+cost,successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END,failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END,updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;
REVOKE ALL ON FUNCTION public.reserve_ai_budget(uuid,text,uuid,text,text,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.settle_ai_budget(uuid,bigint,bigint,text) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.get_ai_cost_dashboard(date) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.reserve_ai_budget(uuid,text,uuid,text,text,bigint,bigint,boolean) TO service_role; GRANT EXECUTE ON FUNCTION public.settle_ai_budget(uuid,bigint,bigint,text) TO service_role; GRANT EXECUTE ON FUNCTION public.get_ai_cost_dashboard(date) TO service_role;
REVOKE ALL ON FUNCTION public.settle_ai_budget_legacy(uuid,bigint,bigint,text) FROM PUBLIC,anon,authenticated;
DROP FUNCTION IF EXISTS public.settle_ai_budget_legacy(uuid,bigint,bigint,text);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;

-- CLIENTS POLICIES
-- Dashboard user can manage their own client profile.
-- (Assumes auth.uid() corresponds to the client ID or client owner user ID)
CREATE POLICY "Clients can view their own profile" ON clients
    FOR SELECT TO authenticated
    USING ((select auth.uid()) = id);

CREATE POLICY "Clients can update their own profile" ON clients
    FOR UPDATE TO authenticated
    USING ((select auth.uid()) = id)
    WITH CHECK ((select auth.uid()) = id);

-- SESSIONS POLICIES
CREATE POLICY "Clients can manage their own sessions" ON sessions
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ROUTING RULES POLICIES
CREATE POLICY "Clients can manage their own routing rules" ON routing_rules
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ANALYTICS EVENTS POLICIES
CREATE POLICY "Clients can view their own analytics events" ON analytics_events
    FOR SELECT TO authenticated
    USING (client_id = (select auth.uid()));

CREATE POLICY "Clients manage own domains" ON client_domains
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 5. WEBHOOK MAPPINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    external_field text NOT NULL,
    internal_field text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- INDEX FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_client_id ON webhook_mappings(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_mappings_unique_pair
  ON webhook_mappings(client_id, external_field, internal_field);

-- RLS POLICIES FOR WEBHOOK MAPPINGS
ALTER TABLE webhook_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own webhook mappings" ON webhook_mappings
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 6. CRM TOKENS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    crm_type text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz,
    connection_status text NOT NULL DEFAULT 'healthy' CHECK (connection_status IN ('healthy', 'unhealthy')),
    last_error text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- INDEX FOR PERFORMANCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tokens_client_id_crm_type ON crm_tokens(client_id, crm_type);

CREATE OR REPLACE FUNCTION complete_crm_oauth(
  client_id_input uuid, crm_type_input text, access_token_input text,
  refresh_token_input text, expires_at_input timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF client_id_input IS NULL OR btrim(crm_type_input) = '' OR btrim(access_token_input) = '' THEN
    RAISE EXCEPTION 'invalid oauth connection data';
  END IF;
  INSERT INTO crm_tokens (client_id, crm_type, access_token, refresh_token, expires_at, connection_status, last_error, updated_at)
  VALUES (client_id_input, crm_type_input, access_token_input, COALESCE(refresh_token_input, ''), expires_at_input, 'healthy', NULL, now())
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

CREATE OR REPLACE FUNCTION complete_calendly_oauth(client_id_input uuid, access_token_input text, refresh_token_input text, expires_at_input timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF client_id_input IS NULL OR btrim(access_token_input) = '' OR btrim(refresh_token_input) = '' THEN RAISE EXCEPTION 'invalid oauth connection data'; END IF;
  INSERT INTO crm_tokens (client_id, crm_type, access_token, refresh_token, expires_at, connection_status, last_error, updated_at)
  VALUES (client_id_input, 'calendly', access_token_input, refresh_token_input, expires_at_input, 'healthy', NULL, now())
  ON CONFLICT (client_id, crm_type) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at, connection_status = 'healthy', last_error = NULL, updated_at = now();
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

-- RLS POLICIES FOR CRM TOKENS
ALTER TABLE crm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own crm tokens" ON crm_tokens
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 7. PLAYBOOK TEMPLATES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS playbook_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    signal_type text,
    tier integer,
    required_inputs jsonb DEFAULT '[]',
    rule_template jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE playbook_templates ENABLE ROW LEVEL SECURITY;

-- SEED PLAYBOOK TEMPLATES
INSERT INTO playbook_templates (name, description, signal_type, tier, required_inputs, rule_template) VALUES 
('Tracked Link VIP Prospect', 'Personalize the page for a known prospect arriving via a tracked link. Show rep calendar and inject their name.', 'cold_email', 1, '[{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. Sarah Chen","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Personalized Headline","placeholder":"e.g. Hey {{prospect_name}}, we know why you are here.","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('LinkedIn Lead Gen Form', 'When a prospect fills your LinkedIn Lead Gen Form, personalize their landing page instantly with full identity.', 'linkedin_lead_gen', 1, '[{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Thank You Headline","placeholder":"e.g. Thanks {{prospect_name}}, book a time below.","type":"text"}]', '{"signal_type":"linkedin_lead_gen","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('HubSpot Deal Stage', 'Route visitors differently based on their current deal stage in HubSpot.', 'cold_email', 1, '[{"field_name":"deal_stage","label":"Deal Stage Value","placeholder":"e.g. proposal_sent","type":"text"},{"field_name":"headline","label":"Stage-Specific Headline","placeholder":"e.g. Ready to move forward?","type":"text"},{"field_name":"cta_url","label":"CTA URL","placeholder":"https://yoursite.com/pricing","type":"text"}]', '{"signal_type":"cold_email","conditions":{"deal_stage_equals":"{{deal_stage}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Returning Visitor', 'Show personalized content to visitors returning via their first-party cookie.', 'returning_visitor', 1, '[{"field_name":"headline","label":"Return Visit Headline","placeholder":"e.g. Welcome back, {{prospect_name}}","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Continue where you left off","type":"text"}]', '{"signal_type":"returning_visitor","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Cold Email Sequence', 'Personalize for prospects arriving from your cold email outreach. Show rep calendar and skip the generic form.', 'cold_email', 2, '[{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. James Wilson","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"sequence_name","label":"Sequence Name","placeholder":"e.g. Q2 Enterprise Outreach","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{rep_name}} is ready to talk — book a time below."}'), 
('Google Ads Keyword', 'Match your landing page headline to the exact keyword a visitor searched before clicking your ad.', 'google_ad', 2, '[{"field_name":"keyword_theme","label":"Keyword Theme","placeholder":"e.g. HubSpot alternative","type":"text"},{"field_name":"headline","label":"Matching Headline","placeholder":"e.g. The HubSpot alternative built for revenue teams","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Start free trial","type":"text"}]', '{"signal_type":"google_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Campaign', 'Route visitors based on the UTM campaign tag in their URL. Works with any ad platform.', 'cold_email', 2, '[{"field_name":"campaign_name","label":"UTM Campaign Value","placeholder":"e.g. enterprise-q2","type":"text"},{"field_name":"headline","label":"Campaign Headline","placeholder":"e.g. Built for enterprise revenue teams","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See enterprise pricing","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_campaign_contains":"{{campaign_name}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('LinkedIn Ad Persona', 'Show persona-specific messaging to visitors arriving from your LinkedIn ad campaigns.', 'linkedin_ad', 2, '[{"field_name":"persona_name","label":"Persona Name","placeholder":"e.g. VP of Marketing","type":"text"},{"field_name":"headline","label":"Persona Headline","placeholder":"e.g. Built for marketing leaders like you","type":"text"},{"field_name":"case_study_url","label":"Case Study URL","placeholder":"https://yoursite.com/case-study","type":"text"}]', '{"signal_type":"linkedin_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('CRM Webhook Deal Stage', 'Automatically route visitors when their CRM deal stage changes via webhook. Works with any CRM.', 'cold_email', 2, '[{"field_name":"deal_stage","label":"Deal Stage Value","placeholder":"e.g. negotiation","type":"text"},{"field_name":"headline","label":"Stage Headline","placeholder":"e.g. Ready to finalize the details?","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Book a call with your account executive","type":"text"}]', '{"signal_type":"cold_email","conditions":{"deal_stage_equals":"{{deal_stage}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Meta Ads Audience', 'Personalize for visitors arriving from Facebook or Instagram ad campaigns.', 'meta_ad', 3, '[{"field_name":"audience_name","label":"Audience Name","placeholder":"e.g. Retargeting — Visited Pricing","type":"text"},{"field_name":"headline","label":"Audience Headline","placeholder":"e.g. Still thinking it over? Here is what others say.","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Start your free trial","type":"text"}]', '{"signal_type":"meta_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('TikTok Ads Campaign', 'Personalize for visitors arriving from TikTok ad campaigns.', 'tiktok_ad', 3, '[{"field_name":"campaign_name","label":"Campaign Name","placeholder":"e.g. B2B Awareness Q2","type":"text"},{"field_name":"headline","label":"Campaign Headline","placeholder":"e.g. You saw us on TikTok. Here is the full story.","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See how it works","type":"text"}]', '{"signal_type":"tiktok_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Source', 'Route differently based on which platform sent the traffic — LinkedIn, Google, email, and more.', 'cold_email', 3, '[{"field_name":"source_name","label":"UTM Source Value","placeholder":"e.g. linkedin","type":"text"},{"field_name":"headline","label":"Source Headline","placeholder":"e.g. Thanks for coming from LinkedIn","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See what others from LinkedIn think","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_source_equals":"{{source_name}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Content Variant', 'Route based on which ad creative a visitor clicked. Perfect for multivariate testing.', 'cold_email', 3, '[{"field_name":"content_tag","label":"UTM Content Value","placeholder":"e.g. creative-a","type":"text"},{"field_name":"headline","label":"Variant Headline","placeholder":"e.g. You clicked our best performing ad","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See why it works","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_content_contains":"{{content_tag}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Existing Customer Upsell', 'Hide acquisition CTAs for existing customers and show expansion or upgrade messaging instead.', 'cold_email', 3, '[{"field_name":"upsell_feature","label":"Feature to Upsell","placeholder":"e.g. Advanced Analytics","type":"text"},{"field_name":"upgrade_url","label":"Upgrade URL","placeholder":"https://yoursite.com/upgrade","type":"text"},{"field_name":"headline","label":"Upsell Headline","placeholder":"e.g. Unlock Advanced Analytics for your team","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"existing_customer"},"action_type":"inject_copy","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('Churned Customer Win-back', 'Show a win-back offer to customers who cancelled and are now revisiting your site.', 'cold_email', 3, '[{"field_name":"offer_text","label":"Win-back Offer","placeholder":"e.g. Come back and get 2 months free","type":"text"},{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Win-back Headline","placeholder":"e.g. We have made a lot of improvements since you left","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"churned"},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('Conference QR Code', 'When a prospect scans your QR code at a conference, skip all forms and show your rep calendar directly.', 'qr_code', 4, '[{"field_name":"event_name","label":"Event Name","placeholder":"e.g. SaaStr Annual 2026","type":"text"},{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. Marcus Lee","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"}]', '{"signal_type":"qr_code","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"Great meeting you at {{event_name}}. Book a time with {{rep_name}} below."}'), 
('Webinar Follow-up', 'Personalize for attendees clicking your post-webinar follow-up email link.', 'cold_email', 4, '[{"field_name":"webinar_topic","label":"Webinar Topic","placeholder":"e.g. RevOps Automation in 2026","type":"text"},{"field_name":"case_study_url","label":"Related Case Study URL","placeholder":"https://yoursite.com/case-study","type":"text"},{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"Thanks for attending our webinar on {{webinar_topic}}. Ready to see how this applies to your team?"}'), 
('G2 or Capterra Referral', 'Visitors from review sites are actively comparing vendors. Skip awareness content and show a direct comparison.', 'g2_referral', 4, '[{"field_name":"competitor_names","label":"Top Competitors","placeholder":"e.g. Mutiny, Qualified","type":"text"},{"field_name":"trial_url","label":"Free Trial URL","placeholder":"https://yoursite.com/trial","type":"text"},{"field_name":"headline","label":"Comparison Headline","placeholder":"e.g. See how we compare to Mutiny and Qualified","type":"text"}]', '{"signal_type":"g2_referral","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Partner Referral', 'Show a co-branded experience for visitors arriving via a partner or affiliate referral link.', 'partner_referral', 4, '[{"field_name":"partner_name","label":"Partner Name","placeholder":"e.g. HubSpot Solutions Partner","type":"text"},{"field_name":"offer_text","label":"Partner Offer","placeholder":"e.g. Exclusive 20% discount for HubSpot partners","type":"text"},{"field_name":"partner_logo_url","label":"Partner Logo URL","placeholder":"https://yoursite.com/partner-logo.png","type":"text"}]', '{"signal_type":"partner_referral","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"Welcome from {{partner_name}}. {{offer_text}}"}'), 
('Free Trial User', 'When a trial user visits your marketing site, show them a targeted upgrade CTA instead of a generic demo form.', 'cold_email', 4, '[{"field_name":"locked_feature","label":"Feature to Unlock","placeholder":"e.g. CRM Enrichment","type":"text"},{"field_name":"calendly_url","label":"Sales Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Talk to sales to unlock CRM Enrichment","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"trial_user"},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{cta_text}}"}'), 
('Freemium Usage Limit', 'When a freemium user hits their usage limit and lands on your site, show them exactly the plan that solves their problem.', 'cold_email', 4, '[{"field_name":"plan_name","label":"Plan Name","placeholder":"e.g. Growth Plan","type":"text"},{"field_name":"upgrade_url","label":"Upgrade URL","placeholder":"https://yoursite.com/pricing","type":"text"},{"field_name":"limit_description","label":"Limit Description","placeholder":"e.g. You have used all 5 tracked links this month","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"freemium"},"action_type":"inject_copy","target_selector":"#main-cta","variant_content":"{{limit_description}}. Upgrade to {{plan_name}} to unlock unlimited tracked links."}');

-- ==========================================
-- 8. ANOMALY ALERTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    alert_text text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    created_at timestamptz DEFAULT now(),
    read boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_client_id ON anomaly_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_read ON anomaly_alerts(client_id, read);

ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own anomaly alerts" ON anomaly_alerts
    FOR SELECT TO authenticated
    USING (client_id = (select auth.uid()));

CREATE POLICY "Clients can update their own anomaly alerts" ON anomaly_alerts
    FOR UPDATE TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 9. WEEKLY DIGESTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS weekly_digests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    summary text NOT NULL,
    top_signal text NOT NULL,
    rep_spotlight text NOT NULL,
    recommendation text NOT NULL,
    delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('processing', 'sent', 'failed')),
    claimed_at timestamptz,
    sent_at timestamptz,
    attempts integer NOT NULL DEFAULT 1,
    last_error text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_digests_client_id ON weekly_digests(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_digests_client_week ON weekly_digests(client_id, week_start);

ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own weekly digests" ON weekly_digests
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- DURABLE BACKGROUND JOB QUEUE
-- ==========================================
CREATE TABLE IF NOT EXISTS weekly_digest_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL UNIQUE,
    period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, previous_start timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','completed_with_failures')),
    scan_cursor uuid, scan_completed_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS background_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_type text NOT NULL, dedupe_key text NOT NULL,
    run_id uuid REFERENCES weekly_digest_runs(id) ON DELETE CASCADE, client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','retry','succeeded','dead')),
    priority smallint NOT NULL DEFAULT 100, attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5,
    available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_until timestamptz, lock_token uuid,
    last_error text, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT background_jobs_dedupe_unique UNIQUE (job_type, dedupe_key)
);
CREATE INDEX IF NOT EXISTS background_jobs_ready_idx ON background_jobs(priority, available_at, created_at) WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS background_jobs_lease_idx ON background_jobs(locked_until) WHERE status='processing';
CREATE INDEX IF NOT EXISTS background_jobs_run_status_idx ON background_jobs(run_id, status);
CREATE INDEX IF NOT EXISTS background_jobs_client_type_idx ON background_jobs(client_id, job_type);
ALTER TABLE weekly_digest_runs ENABLE ROW LEVEL SECURITY; ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON weekly_digest_runs FROM PUBLIC, anon, authenticated; REVOKE ALL ON background_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_weekly_digest_run(week_start_input date, period_start_input timestamptz, period_end_input timestamptz, previous_start_input timestamptz)
RETURNS TABLE(run_id uuid, created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r weekly_digest_runs; was_created boolean:=false; BEGIN
  INSERT INTO weekly_digest_runs(week_start,period_start,period_end,previous_start) VALUES(week_start_input,period_start_input,period_end_input,previous_start_input)
  ON CONFLICT(week_start) DO NOTHING RETURNING * INTO r;
  IF FOUND THEN was_created:=true; ELSE SELECT * INTO r FROM weekly_digest_runs WHERE week_start=week_start_input; END IF;
  INSERT INTO background_jobs(job_type,dedupe_key,run_id,payload,priority) VALUES('weekly_digest_scan','weekly-digest-scan:'||week_start_input::text||':start',r.id,jsonb_build_object('week_start',week_start_input,'after_client_id',NULL),10) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT r.id, was_created;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_background_jobs(limit_input integer DEFAULT 10, lease_seconds_input integer DEFAULT 240) RETURNS SETOF background_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE token uuid:=gen_random_uuid(); BEGIN
  UPDATE background_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'retry' END,available_at=now(),locked_at=NULL,locked_until=NULL,lock_token=NULL,updated_at=now() WHERE status='processing' AND locked_until<now();
  RETURN QUERY WITH picked AS(SELECT id FROM background_jobs WHERE status IN('queued','retry') AND available_at<=now() ORDER BY priority,available_at,created_at FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(limit_input,1),50)) UPDATE background_jobs j SET status='processing',attempts=j.attempts+1,locked_at=now(),locked_until=now()+make_interval(secs=>LEAST(GREATEST(lease_seconds_input,30),600)),lock_token=token,updated_at=now() FROM picked WHERE j.id=picked.id RETURNING j.*;
END; $$;
CREATE OR REPLACE FUNCTION public.complete_background_job(job_id_input uuid,lock_token_input uuid,result_input jsonb DEFAULT '{}'::jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ UPDATE background_jobs SET status='succeeded',completed_at=now(),locked_at=NULL,locked_until=NULL,lock_token=NULL,updated_at=now(),payload=payload||jsonb_build_object('result',result_input) WHERE id=job_id_input AND status='processing' AND lock_token=lock_token_input RETURNING true; $$;
CREATE OR REPLACE FUNCTION public.fail_background_job(job_id_input uuid,lock_token_input uuid,error_input text,retry_at_input timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN UPDATE background_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'retry' END,available_at=CASE WHEN attempts>=max_attempts THEN available_at ELSE retry_at_input END,last_error=left(coalesce(error_input,'unknown failure'),500),locked_at=NULL,locked_until=NULL,lock_token=NULL,updated_at=now() WHERE id=job_id_input AND status='processing' AND lock_token=lock_token_input; RETURN FOUND; END; $$;
CREATE OR REPLACE FUNCTION public.requeue_background_job(job_id_input uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE run_id_value uuid; BEGIN UPDATE background_jobs SET status='retry',available_at=now(),locked_at=NULL,locked_until=NULL,lock_token=NULL,last_error=NULL,attempts=0,updated_at=now() WHERE id=job_id_input AND status='dead' RETURNING run_id INTO run_id_value; IF NOT FOUND THEN RETURN false; END IF; UPDATE weekly_digest_runs SET status='running',completed_at=NULL,updated_at=now() WHERE id=run_id_value; RETURN true; END; $$;
CREATE OR REPLACE FUNCTION public.reconcile_weekly_digest_run(run_id_input uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE result text; BEGIN IF EXISTS(SELECT 1 FROM background_jobs WHERE run_id=run_id_input AND status IN('queued','processing','retry')) THEN result:='running'; ELSIF EXISTS(SELECT 1 FROM background_jobs WHERE run_id=run_id_input AND status='dead') THEN result:='completed_with_failures'; ELSIF EXISTS(SELECT 1 FROM weekly_digest_runs WHERE id=run_id_input AND scan_completed_at IS NULL) THEN result:='running'; ELSE result:='completed'; END IF; UPDATE weekly_digest_runs SET status=result,completed_at=CASE WHEN result='running' THEN NULL ELSE now() END,updated_at=now() WHERE id=run_id_input; RETURN result; END; $$;
REVOKE ALL ON FUNCTION public.start_weekly_digest_run(date,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.claim_background_jobs(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_background_job(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.fail_background_job(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated; REVOKE ALL ON FUNCTION public.requeue_background_job(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reconcile_weekly_digest_run(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_weekly_digest_run(date,timestamptz,timestamptz,timestamptz) TO service_role; GRANT EXECUTE ON FUNCTION public.claim_background_jobs(integer,integer) TO service_role; GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid,uuid,jsonb) TO service_role; GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid,uuid,text,timestamptz) TO service_role; GRANT EXECUTE ON FUNCTION public.requeue_background_job(uuid) TO service_role; GRANT EXECUTE ON FUNCTION public.reconcile_weekly_digest_run(uuid) TO service_role;

-- ==========================================
-- 10. DEAL SCORES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS deal_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text NOT NULL,
    deal_name text,
    stage text,
    deal_value numeric,
    close_date date,
    days_in_stage integer,
    last_activity_days integer,
    contact_count integer,
    website_visits_7d integer,
    score text CHECK (score IN ('RED', 'AMBER', 'GREEN')),
    primary_risk text,
    next_action text,
    draft_email text,
    rep_name text,
    rep_email text,
    created_at timestamptz DEFAULT now(),
    scored_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_scores_client_id ON deal_scores(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_scores_client_deal
  ON deal_scores(client_id, deal_id);

ALTER TABLE deal_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own deal scores" ON deal_scores
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 11. PIPELINE SNAPSHOTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS pipeline_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    total_deals integer DEFAULT 0,
    red_count integer DEFAULT 0,
    amber_count integer DEFAULT 0,
    green_count integer DEFAULT 0,
    total_pipeline_value numeric DEFAULT 0,
    pressure_score integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_snapshots_client_id ON pipeline_snapshots(client_id);

ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own pipeline snapshots" ON pipeline_snapshots
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 12. SCOUT NUDGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS scout_nudges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text,
    deal_name text,
    rep_email text,
    rep_name text,
    message text,
    sent boolean DEFAULT false,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_nudges_client_id ON scout_nudges(client_id);

ALTER TABLE scout_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own scout nudges" ON scout_nudges
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- ==========================================
-- 13. COMPANY DEAL PATTERNS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS company_deal_patterns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    avg_deal_cycle_days integer,
    avg_stage_duration jsonb,
    single_contact_close_rate numeric,
    top_close_signals jsonb,
    calculated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_client_id UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_company_deal_patterns_client_id ON company_deal_patterns(client_id);

ALTER TABLE company_deal_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own company deal patterns" ON company_deal_patterns
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));


-- ==========================================
-- 14. DEAL OBITUARIES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS deal_obituaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text,
    deal_name text,
    deal_value numeric,
    close_date text,
    stage_died_in text,
    days_in_final_stage integer,
    likely_cause text,
    what_rep_could_do text,
    pattern_match text,
    full_obituary text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT unique_client_deal UNIQUE (client_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_obituaries_client_id ON deal_obituaries(client_id);

-- Enable RLS
ALTER TABLE deal_obituaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own deal obituaries" ON deal_obituaries
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));


-- ==========================================
-- 15. ICP PROFILES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS icp_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    top_job_titles jsonb,
    top_industries jsonb,
    avg_deal_value numeric,
    avg_days_to_close integer,
    top_deal_stages jsonb,
    win_count integer,
    icp_summary text,
    generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_client_id ON icp_profiles(client_id);

-- Enable RLS
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own icp profiles" ON icp_profiles
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));

-- Rotate webhook credentials atomically. The previous credential is retained
-- for 24 hours for header/signature callers only; query authentication is
-- disabled immediately.
CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(
    client_id_input uuid,
    new_secret_input uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE(webhook_secret uuid, webhook_previous_secret_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.clients
    SET webhook_previous_secret = clients.webhook_secret,
        webhook_previous_secret_expires_at = now() + interval '24 hours',
        webhook_secret = new_secret_input,
        webhook_query_auth_expires_at = NULL
    WHERE clients.id = client_id_input
    RETURNING clients.webhook_secret, clients.webhook_previous_secret_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_webhook_secret(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret(uuid, uuid) TO service_role;
