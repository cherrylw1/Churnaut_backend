-- Exact, tenant-scoped Analytics v2 aggregates. Recent-event lists remain
-- paginated in the API; totals never depend on PostgREST row limits.
CREATE OR REPLACE FUNCTION analytics_v2_aggregate(
  client_id_input uuid,
  from_date_input timestamptz,
  month_start_input timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH
  client_sessions AS (
    SELECT * FROM sessions WHERE client_id = client_id_input AND session_kind <> 'webhook'
  ),
  window_sessions AS (
    SELECT * FROM client_sessions WHERE created_at >= from_date_input
  ),
  window_events AS (
    SELECT * FROM analytics_events WHERE client_id = client_id_input AND created_at >= from_date_input
  ),
  page_sessions AS (
    SELECT DISTINCT session_id FROM window_events WHERE event_type = 'page_view' AND session_id IS NOT NULL
  ),
  personalized_sessions AS (
    SELECT DISTINCT event.session_id FROM window_events event JOIN page_sessions page USING (session_id)
    WHERE event.event_type = 'rule_triggered'
  ),
  converted_sessions AS (
    SELECT session_id, min(created_at) AS converted_at
    FROM window_events WHERE event_type = 'conversion' AND session_id IS NOT NULL GROUP BY session_id
  ),
  attributed_conversions AS (
    SELECT conversion.session_id, trigger.rule_id
    FROM converted_sessions conversion
    JOIN LATERAL (
      SELECT rule_id FROM analytics_events
      WHERE client_id = client_id_input
        AND session_id = conversion.session_id
        AND event_type = 'rule_triggered'
        AND rule_id IS NOT NULL
        AND created_at <= conversion.converted_at
      ORDER BY created_at DESC LIMIT 1
    ) trigger ON true
  ),
  link_counts AS (
    SELECT COALESCE(signal_type, 'Outbound Link') AS signal, count(*)::int AS links
    FROM window_sessions WHERE session_kind = 'tracked_link' GROUP BY 1
  ),
  click_counts AS (
    SELECT COALESCE(signal_type, 'Outbound Link') AS signal, count(*)::int AS clicks
    FROM window_events WHERE event_type = 'link_clicked' GROUP BY 1
  ),
  conversion_counts AS (
    SELECT COALESCE(event.signal_type, session.signal_type, 'Outbound Link') AS signal,
           count(DISTINCT event.session_id)::int AS conversions
    FROM window_events event LEFT JOIN client_sessions session ON session.id = event.session_id
    WHERE event.event_type = 'conversion' GROUP BY 1
  ),
  signals AS (
    SELECT COALESCE(link.signal, click.signal, conversion.signal) AS signal,
           COALESCE(link.links, 0) AS links,
           COALESCE(click.clicks, 0) AS clicks,
           COALESCE(conversion.conversions, 0) AS conversions
    FROM link_counts link FULL JOIN click_counts click USING (signal)
    FULL JOIN conversion_counts conversion ON conversion.signal = COALESCE(link.signal, click.signal)
  ),
  rep_links AS (
    SELECT assigned_rep AS rep, count(*)::int AS links FROM window_sessions
    WHERE assigned_rep IS NOT NULL AND session_kind = 'tracked_link' GROUP BY assigned_rep
  ),
  rep_conversions AS (
    SELECT session.assigned_rep AS rep, count(DISTINCT conversion.session_id)::int AS conversions
    FROM converted_sessions conversion JOIN client_sessions session ON session.id = conversion.session_id
    WHERE session.assigned_rep IS NOT NULL GROUP BY session.assigned_rep
  ),
  reps AS (
    SELECT COALESCE(link.rep, conversion.rep) AS rep, COALESCE(link.links, 0) AS links,
           COALESCE(conversion.conversions, 0) AS conversions
    FROM rep_links link FULL JOIN rep_conversions conversion USING (rep)
  ),
  rule_triggers AS (
    SELECT rule_id, count(*)::int AS triggers FROM (
      SELECT DISTINCT rule_id, session_id FROM window_events
      WHERE event_type = 'rule_triggered' AND rule_id IS NOT NULL AND session_id IS NOT NULL
    ) unique_triggers GROUP BY rule_id
  ),
  rule_conversions AS (
    SELECT rule_id, count(*)::int AS conversions FROM attributed_conversions GROUP BY rule_id
  ),
  rule_metrics AS (
    SELECT COALESCE(trigger.rule_id, conversion.rule_id) AS rule_id,
           COALESCE(trigger.triggers, 0) AS triggers,
           COALESCE(conversion.conversions, 0) AS conversions
    FROM rule_triggers trigger FULL JOIN rule_conversions conversion USING (rule_id)
  ),
  daily AS (
    SELECT created_at::date AS day, count(*)::int AS count FROM window_events
    WHERE event_type = 'page_view' GROUP BY created_at::date ORDER BY day
  ),
  control_counts AS (
    SELECT
      (SELECT count(*) FROM personalized_sessions)::int AS personalized,
      (SELECT count(*) FROM page_sessions page WHERE NOT EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = page.session_id))::int AS unpersonalized,
      (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = conversion.session_id))::int AS personalized_converted,
      (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM page_sessions page WHERE page.session_id = conversion.session_id) AND NOT EXISTS (SELECT 1 FROM personalized_sessions personalized WHERE personalized.session_id = conversion.session_id))::int AS unpersonalized_converted
  ),
  rule_lift AS (
    SELECT trigger.rule_id, count(*)::int AS personalized_sessions,
           count(*) FILTER (WHERE conversion.session_id IS NOT NULL)::int AS conversions
    FROM (SELECT DISTINCT rule_id, session_id FROM window_events WHERE event_type = 'rule_triggered' AND rule_id IS NOT NULL AND session_id IS NOT NULL) trigger
    LEFT JOIN converted_sessions conversion USING (session_id)
    GROUP BY trigger.rule_id
  )
SELECT jsonb_build_object(
  'summaryStats', jsonb_build_object(
    'totalLinksCreatedThisMonth', (SELECT count(*) FROM client_sessions WHERE session_kind = 'tracked_link' AND created_at >= month_start_input),
    'totalClicksThisMonth', (SELECT count(*) FROM analytics_events WHERE client_id = client_id_input AND event_type = 'link_clicked' AND created_at >= month_start_input),
    'personalizationTriggerRate', CASE WHEN (SELECT count(*) FROM page_sessions) = 0 THEN 0 ELSE round(100.0 * (SELECT count(*) FROM personalized_sessions) / (SELECT count(*) FROM page_sessions)) END,
    'overallConversionRate', CASE WHEN (SELECT count(*) FROM page_sessions) = 0 THEN 0 ELSE round(100.0 * (SELECT count(*) FROM converted_sessions conversion WHERE EXISTS (SELECT 1 FROM page_sessions page WHERE page.session_id = conversion.session_id)) / (SELECT count(*) FROM page_sessions)) END
  ),
  'signalBreakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object('signal', signal, 'links', links, 'clicks', clicks, 'conversions', conversions, 'conversion_rate', CASE WHEN links = 0 THEN 0 ELSE round(100.0 * conversions / links) END) ORDER BY signal) FROM signals), '[]'::jsonb),
  'repPerformance', COALESCE((SELECT jsonb_agg(jsonb_build_object('rep', rep, 'links', links, 'conversions', conversions, 'conversion_rate', CASE WHEN links = 0 THEN 0 ELSE round(100.0 * conversions / links) END) ORDER BY rep) FROM reps), '[]'::jsonb),
  'rulePerformance', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_id', rule_id, 'triggers', triggers, 'conversions', conversions, 'conversion_rate', CASE WHEN triggers = 0 THEN 0 ELSE round(100.0 * conversions / triggers) END)) FROM rule_metrics), '[]'::jsonb),
  'dailyVolume', COALESCE((SELECT jsonb_agg(jsonb_build_object('rawDate', day::text, 'count', count) ORDER BY day) FROM daily), '[]'::jsonb),
  'liftReport', (SELECT jsonb_build_object(
    'personalized_sessions', personalized,
    'unpersonalized_sessions', unpersonalized,
    'personalized_rate', CASE WHEN personalized = 0 THEN 0 ELSE round(100.0 * personalized_converted / personalized) END,
    'baseline_rate', CASE WHEN unpersonalized = 0 THEN 0 ELSE round(100.0 * unpersonalized_converted / unpersonalized) END,
    'overall_lift_pp', (CASE WHEN personalized = 0 THEN 0 ELSE round(100.0 * personalized_converted / personalized) END) - (CASE WHEN unpersonalized = 0 THEN 0 ELSE round(100.0 * unpersonalized_converted / unpersonalized) END),
    'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule_id', rule_id, 'personalized_sessions', personalized_sessions, 'personalized_rate', CASE WHEN personalized_sessions = 0 THEN 0 ELSE round(100.0 * conversions / personalized_sessions) END)) FROM rule_lift), '[]'::jsonb)
  ) FROM control_counts)
);
$$;

REVOKE ALL ON FUNCTION analytics_v2_aggregate(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_v2_aggregate(uuid,timestamptz,timestamptz) TO service_role;
