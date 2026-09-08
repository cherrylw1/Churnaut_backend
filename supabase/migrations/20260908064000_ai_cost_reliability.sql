-- AI cost/reliability controls. All writes are service-role only.
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'interaction';
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS attempt integer;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS estimated_cost_micros bigint;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS usage_source text;
ALTER TABLE llm_logs ADD COLUMN IF NOT EXISTS finish_reason text;
ALTER TABLE llm_logs ALTER COLUMN input_payload SET DEFAULT '{}'::jsonb;
ALTER TABLE llm_logs ALTER COLUMN output_payload SET DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_llm_logs_record_type_created ON llm_logs(record_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_client_created ON llm_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_status_created ON llm_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_provider_model_created ON llm_logs(provider, model_used, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_logs_request_id ON llm_logs(request_id);

CREATE TABLE IF NOT EXISTS ai_plan_limits (
  plan text PRIMARY KEY CHECK (plan IN ('starter','growth','pro')),
  monthly_cost_limit_micros bigint NOT NULL,
  monthly_token_limit bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_plan_limits(plan, monthly_cost_limit_micros, monthly_token_limit) VALUES
  ('starter', 10000000, 2000000), ('growth', 50000000, 10000000), ('pro', 200000000, 40000000)
ON CONFLICT (plan) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_client_limit_overrides (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  monthly_cost_limit_micros bigint,
  monthly_token_limit bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  provider text NOT NULL, model text NOT NULL,
  input_cost_micros_per_million_tokens bigint,
  output_cost_micros_per_million_tokens bigint,
  verified_at timestamptz, active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (provider, model)
);
INSERT INTO ai_model_pricing(provider, model) VALUES ('together', 'moonshotai/Kimi-K2.6') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_usage_monthly (
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  reserved_cost_micros bigint NOT NULL DEFAULT 0,
  estimated_cost_micros bigint NOT NULL DEFAULT 0,
  reserved_tokens bigint NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  successful_attempts integer NOT NULL DEFAULT 0,
  failed_attempts integer NOT NULL DEFAULT 0,
  denied_attempts integer NOT NULL DEFAULT 0,
  expired_reservations integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month_start)
);
CREATE TABLE IF NOT EXISTS ai_budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE, feature text NOT NULL, provider text NOT NULL, model text NOT NULL,
  month_start date NOT NULL, reserved_cost_micros bigint NOT NULL DEFAULT 0, reserved_tokens bigint NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','settled','released','expired_charged')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'), created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_monthly_client ON ai_usage_monthly(client_id, month_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reservations_expiry ON ai_budget_reservations(status, expires_at);
ALTER TABLE ai_plan_limits ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_client_limit_overrides ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_usage_monthly ENABLE ROW LEVEL SECURITY; ALTER TABLE ai_budget_reservations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_plan_limits_plan_check') THEN ALTER TABLE ai_plan_limits ADD CONSTRAINT ai_plan_limits_plan_check CHECK (plan IN ('starter','growth','pro')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_budget_reservations_status_check') THEN ALTER TABLE ai_budget_reservations ADD CONSTRAINT ai_budget_reservations_status_check CHECK (status IN ('reserved','settled','released','expired_charged')); END IF;
END $$;

CREATE OR REPLACE FUNCTION reserve_ai_budget(client_id_input uuid, feature_input text, request_id_input uuid, provider_input text, model_input text, estimated_input_tokens bigint, max_output_tokens bigint, enforce_input boolean DEFAULT false)
RETURNS TABLE(allowed boolean, reservation_id uuid, reserved_cost_micros bigint, reserved_tokens bigint, remaining_cost_micros bigint, remaining_tokens bigint, denial_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan_name text; cost_limit bigint; token_limit bigint; month_value date := date_trunc('month', now())::date; price_in bigint; price_out bigint; cost_value bigint := 0; usage_row ai_usage_monthly%ROWTYPE; existing ai_budget_reservations%ROWTYPE; projected_cost bigint; projected_tokens bigint; stale_cost bigint := 0; stale_tokens bigint := 0; stale_count integer := 0;
BEGIN
  SELECT plan INTO plan_name FROM clients WHERE id = client_id_input; IF plan_name IS NULL THEN plan_name := 'starter'; END IF;
  SELECT COALESCE(o.monthly_cost_limit_micros, p.monthly_cost_limit_micros), COALESCE(o.monthly_token_limit, p.monthly_token_limit) INTO cost_limit, token_limit FROM ai_plan_limits p LEFT JOIN ai_client_limit_overrides o ON o.client_id = client_id_input WHERE p.plan = CASE WHEN plan_name IN ('starter','growth','pro') THEN plan_name ELSE 'starter' END;
  SELECT * INTO existing FROM ai_budget_reservations WHERE request_id = request_id_input; IF existing.id IS NOT NULL AND existing.status = 'reserved' THEN RETURN QUERY SELECT true, existing.id, existing.reserved_cost_micros, existing.reserved_tokens, GREATEST(0,cost_limit-existing.reserved_cost_micros), GREATEST(0,token_limit-existing.reserved_tokens), NULL::text; RETURN; END IF;
  SELECT input_cost_micros_per_million_tokens, output_cost_micros_per_million_tokens INTO price_in, price_out FROM ai_model_pricing WHERE provider = provider_input AND model = model_input AND active;
  IF price_in IS NOT NULL AND price_out IS NOT NULL THEN cost_value := ceil((estimated_input_tokens * price_in + max_output_tokens * price_out)::numeric / 1000000); END IF;
  INSERT INTO ai_usage_monthly(client_id, month_start) VALUES(client_id_input, month_value) ON CONFLICT DO NOTHING;
  SELECT * INTO usage_row FROM ai_usage_monthly WHERE client_id = client_id_input AND month_start = month_value FOR UPDATE;
  WITH stale AS (SELECT COALESCE(sum(reserved_cost_micros),0) cost, COALESCE(sum(reserved_tokens),0) tokens FROM ai_budget_reservations WHERE client_id=client_id_input AND month_start=month_value AND status='reserved' AND expires_at < now())
  SELECT cost, tokens INTO stale_cost, stale_tokens FROM stale; SELECT count(*) INTO stale_count FROM ai_budget_reservations WHERE client_id=client_id_input AND month_start=month_value AND status='reserved' AND expires_at < now();
  IF stale_count > 0 THEN UPDATE ai_budget_reservations SET status='expired_charged', settled_at=now() WHERE client_id=client_id_input AND month_start=month_value AND status='reserved' AND expires_at < now(); UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-stale_cost), reserved_tokens=GREATEST(0,reserved_tokens-stale_tokens), estimated_cost_micros=estimated_cost_micros+stale_cost, input_tokens=input_tokens+stale_tokens, expired_reservations=expired_reservations+stale_count, failed_attempts=failed_attempts+stale_count, updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; usage_row.reserved_cost_micros := GREATEST(0,usage_row.reserved_cost_micros-stale_cost); usage_row.reserved_tokens := GREATEST(0,usage_row.reserved_tokens-stale_tokens); usage_row.estimated_cost_micros := usage_row.estimated_cost_micros+stale_cost; usage_row.input_tokens := usage_row.input_tokens+stale_tokens; END IF;
  projected_cost := usage_row.estimated_cost_micros + usage_row.reserved_cost_micros + cost_value; projected_tokens := usage_row.input_tokens + usage_row.output_tokens + usage_row.reserved_tokens + estimated_input_tokens + max_output_tokens;
  IF enforce_input AND (price_in IS NULL OR price_out IS NULL) THEN UPDATE ai_usage_monthly SET denied_attempts=denied_attempts+1, updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; RETURN QUERY SELECT false,NULL::uuid,0::bigint,0::bigint,GREATEST(0,cost_limit-projected_cost),GREATEST(0,token_limit-projected_tokens),'pricing_missing'; RETURN; END IF;
  IF enforce_input AND (projected_cost > cost_limit OR projected_tokens > token_limit) THEN UPDATE ai_usage_monthly SET denied_attempts=denied_attempts+1, updated_at=now() WHERE client_id=client_id_input AND month_start=month_value; RETURN QUERY SELECT false,NULL::uuid,cost_value,estimated_input_tokens+max_output_tokens,GREATEST(0,cost_limit-(projected_cost-cost_value)),GREATEST(0,token_limit-(projected_tokens-estimated_input_tokens-max_output_tokens)),'budget_exceeded'; RETURN; END IF;
  INSERT INTO ai_budget_reservations(client_id,request_id,feature,provider,model,month_start,reserved_cost_micros,reserved_tokens) VALUES(client_id_input,request_id_input,feature_input,provider_input,model_input,month_value,cost_value,estimated_input_tokens+max_output_tokens) RETURNING * INTO existing;
  UPDATE ai_usage_monthly SET reserved_cost_micros=reserved_cost_micros+cost_value, reserved_tokens=reserved_tokens+existing.reserved_tokens, updated_at=now() WHERE client_id=client_id_input AND month_start=month_value;
  RETURN QUERY SELECT true,existing.id,cost_value,existing.reserved_tokens,GREATEST(0,cost_limit-projected_cost),GREATEST(0,token_limit-projected_tokens),NULL::text;
END; $$;

CREATE OR REPLACE FUNCTION settle_ai_budget_legacy(reservation_id_input uuid, input_tokens_input bigint, output_tokens_input bigint, status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_budget_reservations%ROWTYPE; price_in bigint; price_out bigint; actual_cost bigint := 0; charged_input bigint; charged_output bigint;
BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status <> 'reserved' THEN RETURN false; END IF; charged_input:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens ELSE GREATEST(0,input_tokens_input) END; charged_output:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens, output_cost_micros_per_million_tokens INTO price_in,price_out FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF price_in IS NOT NULL AND price_out IS NOT NULL THEN actual_cost := ceil((GREATEST(0,input_tokens_input)*price_in + GREATEST(0,output_tokens_input)*price_out)::numeric/1000000); END IF; IF status_input='expired_charged' THEN actual_cost := GREATEST(actual_cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input, settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros), reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens), input_tokens=input_tokens+charged_input, output_tokens=output_tokens+charged_output, estimated_cost_micros=estimated_cost_micros+actual_cost, successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END, failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END, updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;

CREATE OR REPLACE FUNCTION get_ai_cost_dashboard_legacy(month_start_input date DEFAULT date_trunc('month', now())::date) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
SELECT jsonb_build_object('month_start',month_start_input,'usage',COALESCE((SELECT jsonb_build_object('estimated_cost_micros',COALESCE(sum(estimated_cost_micros),0),'input_tokens',COALESCE(sum(input_tokens),0),'output_tokens',COALESCE(sum(output_tokens),0),'reserved_cost_micros',COALESCE(sum(reserved_cost_micros),0),'reserved_tokens',COALESCE(sum(reserved_tokens),0),'successful_attempts',COALESCE(sum(successful_attempts),0),'failed_attempts',COALESCE(sum(failed_attempts),0),'denied_attempts',COALESCE(sum(denied_attempts),0),'expired_reservations',COALESCE(sum(expired_reservations),0)) FROM ai_usage_monthly u WHERE u.month_start=month_start_input),'{}'::jsonb),'by_client',COALESCE((SELECT jsonb_agg(x) FROM (SELECT c.id,c.company_name,c.plan,COALESCE(u.estimated_cost_micros,0) estimated_cost_micros,COALESCE(u.input_tokens,0) input_tokens,COALESCE(u.output_tokens,0) output_tokens,COALESCE(u.denied_attempts,0) denied_attempts,COALESCE(o.monthly_cost_limit_micros,p.monthly_cost_limit_micros) cost_limit_micros,COALESCE(o.monthly_token_limit,p.monthly_token_limit) token_limit FROM clients c LEFT JOIN ai_usage_monthly u ON u.client_id=c.id AND u.month_start=month_start_input LEFT JOIN ai_plan_limits p ON p.plan=CASE WHEN c.plan IN ('starter','growth','pro') THEN c.plan ELSE 'starter' END LEFT JOIN ai_client_limit_overrides o ON o.client_id=c.id ORDER BY estimated_cost_micros DESC) x),'[]'::jsonb),'by_feature',COALESCE((SELECT jsonb_agg(x) FROM (SELECT feature,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros,sum(COALESCE(input_tokens,0)) input_tokens,sum(COALESCE(output_tokens,0)) output_tokens,count(*) FILTER (WHERE status<>'success') errors,count(*) FILTER (WHERE fallback_used) fallbacks FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input + interval '1 month') GROUP BY feature ORDER BY estimated_cost_micros DESC) x),'[]'::jsonb),'by_model',COALESCE((SELECT jsonb_agg(x) FROM (SELECT provider,model_used,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros,count(*) FILTER (WHERE status<>'success') errors FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input + interval '1 month') GROUP BY provider,model_used) x),'[]'::jsonb)); $$;
CREATE OR REPLACE FUNCTION settle_ai_budget(reservation_id_input uuid, input_tokens_input bigint, output_tokens_input bigint, status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_budget_reservations%ROWTYPE; price_in bigint; price_out bigint; actual_cost bigint:=0; charged_input bigint; charged_output bigint;
BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status <> 'reserved' THEN RETURN false; END IF; charged_input:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens WHEN status_input='settled' THEN GREATEST(0,input_tokens_input) ELSE 0 END; charged_output:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO price_in,price_out FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF price_in IS NOT NULL AND price_out IS NOT NULL THEN actual_cost:=ceil((GREATEST(0,input_tokens_input)*price_in+GREATEST(0,output_tokens_input)*price_out)::numeric/1000000); END IF; IF status_input='expired_charged' THEN actual_cost:=GREATEST(actual_cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input,settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros),reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens),input_tokens=input_tokens+charged_input,output_tokens=output_tokens+charged_output,estimated_cost_micros=estimated_cost_micros+actual_cost,successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END,failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END,updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;
CREATE OR REPLACE FUNCTION settle_ai_budget(reservation_id_input uuid,input_tokens_input bigint,output_tokens_input bigint,status_input text DEFAULT 'settled') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r ai_budget_reservations%ROWTYPE; pi bigint; po bigint; cost bigint:=0; ci bigint; co bigint; BEGIN SELECT * INTO r FROM ai_budget_reservations WHERE id=reservation_id_input FOR UPDATE; IF r.id IS NULL OR r.status<>'reserved' THEN RETURN false; END IF; ci:=CASE WHEN status_input='expired_charged' THEN r.reserved_tokens WHEN status_input='settled' THEN GREATEST(0,input_tokens_input) ELSE 0 END; co:=CASE WHEN status_input='settled' THEN GREATEST(0,output_tokens_input) ELSE 0 END; SELECT input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens INTO pi,po FROM ai_model_pricing WHERE provider=r.provider AND model=r.model AND active; IF status_input<>'released' AND pi IS NOT NULL AND po IS NOT NULL THEN cost:=ceil((GREATEST(0,input_tokens_input)*pi+GREATEST(0,output_tokens_input)*po)::numeric/1000000); END IF; IF status_input='expired_charged' THEN cost:=GREATEST(cost,r.reserved_cost_micros); END IF; UPDATE ai_budget_reservations SET status=status_input,settled_at=now() WHERE id=r.id; UPDATE ai_usage_monthly SET reserved_cost_micros=GREATEST(0,reserved_cost_micros-r.reserved_cost_micros),reserved_tokens=GREATEST(0,reserved_tokens-r.reserved_tokens),input_tokens=input_tokens+ci,output_tokens=output_tokens+co,estimated_cost_micros=estimated_cost_micros+cost,successful_attempts=successful_attempts+CASE WHEN status_input='settled' THEN 1 ELSE 0 END,failed_attempts=failed_attempts+CASE WHEN status_input<>'settled' THEN 1 ELSE 0 END,updated_at=now() WHERE client_id=r.client_id AND month_start=r.month_start; RETURN true; END; $$;
CREATE OR REPLACE FUNCTION get_ai_cost_dashboard(month_start_input date DEFAULT date_trunc('month',now())::date) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('month_start',month_start_input,'usage',COALESCE((SELECT jsonb_build_object('estimated_cost_micros',COALESCE(sum(estimated_cost_micros),0),'input_tokens',COALESCE(sum(input_tokens),0),'output_tokens',COALESCE(sum(output_tokens),0),'denied_attempts',COALESCE(sum(denied_attempts),0),'expired_reservations',COALESCE(sum(expired_reservations),0)) FROM ai_usage_monthly WHERE month_start=month_start_input),'{}'::jsonb),'by_client',COALESCE((SELECT jsonb_agg(x) FROM (SELECT c.id,c.company_name,c.plan,COALESCE(u.estimated_cost_micros,0) estimated_cost_micros,COALESCE(u.input_tokens,0) input_tokens,COALESCE(u.output_tokens,0) output_tokens,COALESCE(u.denied_attempts,0) denied_attempts,COALESCE(o.monthly_cost_limit_micros,p.monthly_cost_limit_micros) cost_limit_micros,COALESCE(o.monthly_token_limit,p.monthly_token_limit) token_limit FROM clients c LEFT JOIN ai_usage_monthly u ON u.client_id=c.id AND u.month_start=month_start_input LEFT JOIN ai_plan_limits p ON p.plan=CASE WHEN c.plan IN('starter','growth','pro') THEN c.plan ELSE 'starter' END LEFT JOIN ai_client_limit_overrides o ON o.client_id=c.id ORDER BY estimated_cost_micros DESC)x),'[]'::jsonb),'by_feature',COALESCE((SELECT jsonb_agg(x) FROM (SELECT feature,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros,count(*) FILTER(WHERE usage_source='pricing_missing') unpriced,count(*) FILTER(WHERE status='timeout') timeouts,count(*) FILTER(WHERE fallback_used) fallbacks FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input+interval '1 month') GROUP BY feature)x),'[]'::jsonb),'by_model',COALESCE((SELECT jsonb_agg(x) FROM (SELECT provider,model_used,count(*) attempts,sum(COALESCE(estimated_cost_micros,0)) estimated_cost_micros FROM llm_logs WHERE record_type='provider_attempt' AND created_at>=month_start_input AND created_at<(month_start_input+interval '1 month') GROUP BY provider,model_used)x),'[]'::jsonb)); $$;
REVOKE ALL ON FUNCTION reserve_ai_budget(uuid,text,uuid,text,text,bigint,bigint,boolean) FROM PUBLIC, anon, authenticated; REVOKE ALL ON FUNCTION settle_ai_budget(uuid,bigint,bigint,text) FROM PUBLIC, anon, authenticated; REVOKE ALL ON FUNCTION get_ai_cost_dashboard(date) FROM PUBLIC, anon, authenticated; REVOKE ALL ON FUNCTION get_ai_cost_dashboard_legacy(date) FROM PUBLIC, anon, authenticated; DROP FUNCTION IF EXISTS get_ai_cost_dashboard_legacy(date);
REVOKE ALL ON FUNCTION settle_ai_budget_legacy(uuid,bigint,bigint,text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS settle_ai_budget_legacy(uuid,bigint,bigint,text);
GRANT EXECUTE ON FUNCTION reserve_ai_budget(uuid,text,uuid,text,text,bigint,bigint,boolean) TO service_role; GRANT EXECUTE ON FUNCTION settle_ai_budget(uuid,bigint,bigint,text) TO service_role; GRANT EXECUTE ON FUNCTION get_ai_cost_dashboard(date) TO service_role;
