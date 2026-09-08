-- Keep rule ordering changes transactional. A failed reorder or delete must not
-- leave only part of a tenant's priority list updated.
CREATE OR REPLACE FUNCTION reorder_routing_rules(
  client_id_input uuid,
  rules_input jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  requested_count integer;
  matched_count integer;
  updated_count integer;
BEGIN
  IF jsonb_typeof(rules_input) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'rules_input must be an array';
  END IF;

  SELECT count(*) INTO requested_count FROM jsonb_array_elements(rules_input);
  IF requested_count = 0 THEN RETURN 0; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    GROUP BY item.id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    GROUP BY item.priority HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    WHERE item.id IS NULL OR item.priority IS NULL OR item.priority < 1
  ) THEN
    RAISE EXCEPTION 'rule ids and positive priorities must be unique';
  END IF;

  SELECT count(*) INTO matched_count
  FROM routing_rules rule
  JOIN jsonb_to_recordset(rules_input) AS item(id uuid, priority integer)
    ON item.id = rule.id
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

CREATE OR REPLACE FUNCTION delete_routing_rule_and_resequence(
  client_id_input uuid,
  rule_id_input uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  deleted boolean := false;
BEGIN
  DELETE FROM routing_rules
  WHERE id = rule_id_input AND client_id = client_id_input;
  deleted := FOUND;
  IF NOT deleted THEN RETURN false; END IF;

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY priority, created_at, id)::integer AS next_priority
    FROM routing_rules
    WHERE client_id = client_id_input
  )
  UPDATE routing_rules rule
  SET priority = ranked.next_priority, updated_at = now()
  FROM ranked
  WHERE rule.id = ranked.id AND rule.priority IS DISTINCT FROM ranked.next_priority;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION reorder_routing_rules(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_routing_rule_and_resequence(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reorder_routing_rules(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION delete_routing_rule_and_resequence(uuid,uuid) TO service_role;
