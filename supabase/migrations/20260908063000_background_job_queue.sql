-- Durable, service-role-only queue for scheduled weekly digests.
CREATE TABLE IF NOT EXISTS public.weekly_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  previous_start timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','completed_with_failures')),
  scan_cursor uuid,
  scan_completed_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  dedupe_key text NOT NULL,
  run_id uuid REFERENCES public.weekly_digest_runs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','retry','succeeded','dead')),
  priority smallint NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_until timestamptz,
  lock_token uuid,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT background_jobs_dedupe_unique UNIQUE (job_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS background_jobs_ready_idx ON public.background_jobs (priority, available_at, created_at) WHERE status IN ('queued','retry');
CREATE INDEX IF NOT EXISTS background_jobs_lease_idx ON public.background_jobs (locked_until) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS background_jobs_run_status_idx ON public.background_jobs (run_id, status);
CREATE INDEX IF NOT EXISTS background_jobs_client_type_idx ON public.background_jobs (client_id, job_type);

ALTER TABLE public.weekly_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_digest_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.background_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_weekly_digest_run(
  week_start_input date, period_start_input timestamptz, period_end_input timestamptz, previous_start_input timestamptz
) RETURNS TABLE(run_id uuid, created boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.weekly_digest_runs; was_created boolean := false;
BEGIN
  INSERT INTO public.weekly_digest_runs (week_start, period_start, period_end, previous_start)
  VALUES (week_start_input, period_start_input, period_end_input, previous_start_input)
  ON CONFLICT (week_start) DO NOTHING RETURNING * INTO r;
  IF FOUND THEN was_created := true; ELSE SELECT * INTO r FROM public.weekly_digest_runs WHERE week_start = week_start_input; END IF;
  INSERT INTO public.background_jobs (job_type, dedupe_key, run_id, payload, priority)
  VALUES ('weekly_digest_scan', 'weekly-digest-scan:' || week_start_input::text || ':start', r.id,
          jsonb_build_object('week_start', week_start_input, 'after_client_id', NULL), 10)
  ON CONFLICT (job_type, dedupe_key) DO NOTHING;
  RETURN QUERY SELECT r.id, was_created;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_background_jobs(limit_input integer DEFAULT 10, lease_seconds_input integer DEFAULT 240)
RETURNS SETOF public.background_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE token uuid := gen_random_uuid();
BEGIN
  UPDATE public.background_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'retry' END,
    available_at = now(), locked_at = NULL, locked_until = NULL, lock_token = NULL, updated_at = now()
  WHERE status = 'processing' AND locked_until < now();
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.background_jobs
    WHERE status IN ('queued','retry') AND available_at <= now()
    ORDER BY priority, available_at, created_at
    FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(limit_input,1),50)
  )
  UPDATE public.background_jobs j SET status='processing', attempts=j.attempts+1, locked_at=now(),
    locked_until=now()+make_interval(secs=>LEAST(GREATEST(lease_seconds_input,30),600)), lock_token=token, updated_at=now()
  FROM picked WHERE j.id=picked.id RETURNING j.*;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_background_job(job_id_input uuid, lock_token_input uuid, result_input jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.background_jobs SET status='succeeded', completed_at=now(), locked_at=NULL, locked_until=NULL, lock_token=NULL, updated_at=now(), payload=payload || jsonb_build_object('result', result_input)
  WHERE id=job_id_input AND status='processing' AND lock_token=lock_token_input RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.fail_background_job(job_id_input uuid, lock_token_input uuid, error_input text, retry_at_input timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.background_jobs SET status=CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'retry' END,
    available_at=CASE WHEN attempts >= max_attempts THEN available_at ELSE retry_at_input END,
    last_error=left(coalesce(error_input,'unknown failure'),500), locked_at=NULL, locked_until=NULL, lock_token=NULL, updated_at=now()
  WHERE id=job_id_input AND status='processing' AND lock_token=lock_token_input;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.requeue_background_job(job_id_input uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE run_id_value uuid;
BEGIN
  UPDATE public.background_jobs SET status='retry', available_at=now(), locked_at=NULL, locked_until=NULL, lock_token=NULL, last_error=NULL, attempts=0, updated_at=now() WHERE id=job_id_input AND status='dead' RETURNING run_id INTO run_id_value;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.weekly_digest_runs SET status='running', completed_at=NULL, updated_at=now() WHERE id=run_id_value;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.reconcile_weekly_digest_run(run_id_input uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.background_jobs WHERE run_id=run_id_input AND status IN ('queued','processing','retry')) THEN result := 'running';
  ELSIF EXISTS (SELECT 1 FROM public.background_jobs WHERE run_id=run_id_input AND status='dead') THEN result := 'completed_with_failures';
  ELSIF EXISTS (SELECT 1 FROM public.weekly_digest_runs WHERE id=run_id_input AND scan_completed_at IS NULL) THEN result := 'running';
  ELSE result := 'completed'; END IF;
  UPDATE public.weekly_digest_runs SET status=result, completed_at=CASE WHEN result='running' THEN NULL ELSE now() END, updated_at=now() WHERE id=run_id_input;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.start_weekly_digest_run(date,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_background_jobs(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_background_job(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_background_job(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_background_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_weekly_digest_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_weekly_digest_run(date,timestamptz,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_background_jobs(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_background_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_weekly_digest_run(uuid) TO service_role;
