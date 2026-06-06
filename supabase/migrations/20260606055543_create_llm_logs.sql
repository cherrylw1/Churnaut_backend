-- llm_logs: captures every LLM inference call for future fine-tuning
CREATE TABLE llm_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- context
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  session_id text,
  deal_id text,

  -- feature identification
  feature text NOT NULL,
  model_used text NOT NULL,
  prompt_version text DEFAULT 'v1.0',

  -- llm call data
  system_prompt text,
  input_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL,

  -- performance
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,

  -- feedback (filled later via UI, null for now)
  feedback_score integer,
  feedback_type text,
  feedback_edited_output jsonb,
  feedback_at timestamptz,
  feedback_source text
);

-- indexes
CREATE INDEX idx_llm_logs_client_id ON llm_logs(client_id);
CREATE INDEX idx_llm_logs_feature ON llm_logs(feature);
CREATE INDEX idx_llm_logs_created_at ON llm_logs(created_at DESC);
CREATE INDEX idx_llm_logs_feedback_type ON llm_logs(feedback_type)
  WHERE feedback_type IS NOT NULL;

-- RLS: only service role can read/write (no client-side access)
ALTER TABLE llm_logs ENABLE ROW LEVEL SECURITY;
