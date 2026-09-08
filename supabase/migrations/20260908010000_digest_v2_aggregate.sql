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

REVOKE ALL ON FUNCTION digest_v2_aggregate(uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION digest_v2_aggregate(uuid,timestamptz,timestamptz,timestamptz) TO service_role;
