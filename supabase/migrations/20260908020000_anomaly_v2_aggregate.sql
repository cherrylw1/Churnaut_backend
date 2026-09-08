-- Exact anomaly inputs: event-timed conversion cohorts plus daily rule counts.
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

REVOKE ALL ON FUNCTION anomaly_v2_aggregate(uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION anomaly_v2_aggregate(uuid,timestamptz,timestamptz,timestamptz) TO service_role;
