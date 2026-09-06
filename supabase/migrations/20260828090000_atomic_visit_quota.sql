-- Atomically consume one visit only when the customer's plan quota is available.
-- This prevents concurrent resolve requests from overshooting the monthly limit.
CREATE OR REPLACE FUNCTION increment_monthly_visits_if_available(
  client_id_input UUID,
  visit_limit_input INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE clients
  SET monthly_visits = COALESCE(monthly_visits, 0) + 1
  WHERE id = client_id_input
    AND COALESCE(monthly_visits, 0) < visit_limit_input;

  RETURN FOUND;
END;
$$;
