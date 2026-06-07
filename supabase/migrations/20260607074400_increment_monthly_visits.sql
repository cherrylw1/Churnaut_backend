CREATE OR REPLACE FUNCTION increment_monthly_visits(client_id_input UUID)
RETURNS void AS $$
BEGIN
  UPDATE clients
  SET monthly_visits = monthly_visits + 1
  WHERE id = client_id_input;
END;
$$ LANGUAGE plpgsql;
