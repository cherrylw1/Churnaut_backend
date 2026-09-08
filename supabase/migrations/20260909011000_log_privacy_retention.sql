-- Minimize historical inference data and enforce bounded retention.
ALTER TABLE IF EXISTS public.llm_logs ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'interaction';
ALTER TABLE IF EXISTS public.llm_logs ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE IF EXISTS public.llm_logs ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Scrub historical content before removing the legacy columns.
UPDATE public.llm_logs
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('legacy_record_scrubbed', true),
    system_prompt = NULL,
    input_payload = '{}'::jsonb,
    output_payload = '{}'::jsonb,
    feedback_edited_output = NULL
WHERE system_prompt IS NOT NULL
   OR input_payload <> '{}'::jsonb
   OR output_payload <> '{}'::jsonb
   OR feedback_edited_output IS NOT NULL;
UPDATE public.analytics_events
SET metadata = COALESCE(metadata, '{}'::jsonb) - 'payload' - 'transformed'
WHERE event_type = 'webhook_received'
  AND metadata IS NOT NULL
  AND (metadata ? 'payload' OR metadata ? 'transformed');

DROP TRIGGER IF EXISTS sanitize_llm_log_payload_before_write ON public.llm_logs;
DROP FUNCTION IF EXISTS public.sanitize_llm_log_payload();
ALTER TABLE IF EXISTS public.llm_logs DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE IF EXISTS public.llm_logs DROP COLUMN IF EXISTS input_payload;
ALTER TABLE IF EXISTS public.llm_logs DROP COLUMN IF EXISTS output_payload;
ALTER TABLE IF EXISTS public.llm_logs DROP COLUMN IF EXISTS feedback_edited_output;

CREATE OR REPLACE FUNCTION public.purge_sensitive_logs(interaction_days integer DEFAULT 30, telemetry_days integer DEFAULT 180)
RETURNS TABLE (llm_deleted bigint, webhook_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a bigint; b bigint;
BEGIN
  IF interaction_days < 7 OR interaction_days > 365 OR telemetry_days < 30 OR telemetry_days > 730 THEN RAISE EXCEPTION 'Retention windows are outside approved bounds'; END IF;
  DELETE FROM public.llm_logs WHERE created_at < now() - make_interval(days => CASE WHEN record_type = 'provider_attempt' THEN telemetry_days ELSE interaction_days END);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.analytics_events WHERE event_type = 'webhook_received' AND created_at < now() - make_interval(days => interaction_days);
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN QUERY SELECT a, b;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_sensitive_logs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_sensitive_logs(integer, integer) TO service_role;
ALTER TABLE IF EXISTS public.llm_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_logs TO service_role;
