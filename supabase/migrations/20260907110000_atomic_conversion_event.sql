-- Keep the conversion state transition and its analytics event consistent.
-- Production preflight must confirm there are no duplicate conversion events
-- per (client_id, session_id) before this index is created.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_one_conversion
  ON analytics_events(client_id, session_id)
  WHERE event_type = 'conversion' AND session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION set_session_conversion(client_id_input uuid, session_id_input text, converted_input boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE transitioned boolean := false;
BEGIN
  IF converted_input THEN
    UPDATE sessions SET converted = true, converted_at = COALESCE(converted_at, now())
    WHERE id = session_id_input AND client_id = client_id_input AND converted IS DISTINCT FROM true;
    transitioned := FOUND;

    -- Also repairs a previously missed event on an idempotent webhook retry.
    INSERT INTO analytics_events (client_id, session_id, event_type, signal_type, metadata)
    SELECT client_id_input, id, 'conversion', COALESCE(signal_type, 'crm_webhook'), '{"schema_version":2}'::jsonb
    FROM sessions WHERE id = session_id_input AND client_id = client_id_input AND converted = true
    ON CONFLICT (client_id, session_id) WHERE event_type = 'conversion' AND session_id IS NOT NULL DO NOTHING;
  ELSE
    UPDATE sessions SET converted = false, converted_at = NULL
    WHERE id = session_id_input AND client_id = client_id_input;
  END IF;
  RETURN transitioned;
END;
$$;

REVOKE ALL ON FUNCTION set_session_conversion(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_session_conversion(uuid,text,boolean) TO service_role;
