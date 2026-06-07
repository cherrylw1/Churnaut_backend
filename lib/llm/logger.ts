import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LLMLogInput {
  client_id?: string;
  session_id?: string;
  deal_id?: string;
  feature: 'scout_score' | 'copywriter' | 'weekly_digest';
  model_used?: string;
  prompt_version?: string;
  system_prompt?: string;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export async function logLLMCall(data: LLMLogInput): Promise<void> {
  supabase
    .from('llm_logs')
    .insert({
      ...data,
      model_used: data.model_used ?? 'gemini-2.0-flash',
      prompt_version: data.prompt_version ?? 'v1.0',
    })
    .then();
}
