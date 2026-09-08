-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_domains ENABLE ROW LEVEL SECURITY;

-- CLIENTS POLICIES
-- Dashboard user can manage their own client profile.
-- (Assumes auth.uid() corresponds to the client ID or client owner user ID)
CREATE POLICY "Clients can view their own profile" ON clients
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Clients can update their own profile" ON clients
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- SESSIONS POLICIES
CREATE POLICY "Clients can view their own sessions" ON sessions
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own sessions" ON sessions
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ROUTING RULES POLICIES
CREATE POLICY "Clients can view their own routing rules" ON routing_rules
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own routing rules" ON routing_rules
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ANALYTICS EVENTS POLICIES
CREATE POLICY "Clients can view their own analytics events" ON analytics_events
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients manage own domains" ON client_domains
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own webhook mappings" ON webhook_mappings
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own webhook mappings" ON webhook_mappings
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own crm tokens" ON crm_tokens
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own crm tokens" ON crm_tokens
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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
    USING (client_id = auth.uid());

CREATE POLICY "Clients can update their own anomaly alerts" ON anomaly_alerts
    FOR UPDATE TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own weekly digests" ON weekly_digests
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own weekly digests" ON weekly_digests
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own deal scores" ON deal_scores
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own deal scores" ON deal_scores
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own pipeline snapshots" ON pipeline_snapshots
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own pipeline snapshots" ON pipeline_snapshots
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own scout nudges" ON scout_nudges
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own scout nudges" ON scout_nudges
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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

CREATE POLICY "Clients can view their own company deal patterns" ON company_deal_patterns
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own company deal patterns" ON company_deal_patterns
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());


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

CREATE POLICY "Clients can view their own deal obituaries" ON deal_obituaries
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own deal obituaries" ON deal_obituaries
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());


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

CREATE POLICY "Clients can view their own icp profiles" ON icp_profiles
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own icp profiles" ON icp_profiles
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
