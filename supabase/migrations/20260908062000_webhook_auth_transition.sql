-- Migrate webhook credentials away from URL query parameters without a hard
-- cutover. Existing clients get a 90-day compatibility window; new clients
-- leave it NULL and therefore never accept client_key URLs.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS webhook_query_auth_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_previous_secret uuid,
  ADD COLUMN IF NOT EXISTS webhook_previous_secret_expires_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE webhook_secret IS NOT NULL
    GROUP BY webhook_secret HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate webhook_secret values exist; resolve them before enabling unique webhook authentication';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clients_webhook_secret_unique
  ON public.clients (webhook_secret) WHERE webhook_secret IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_webhook_previous_secret_idx
  ON public.clients (webhook_previous_secret)
  WHERE webhook_previous_secret IS NOT NULL;

UPDATE public.clients
SET webhook_query_auth_expires_at = now() + interval '90 days'
WHERE webhook_query_auth_expires_at IS NULL
  AND webhook_secret IS NOT NULL;

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
