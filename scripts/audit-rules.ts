import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRuleRequestSchema } from '../lib/validation';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from('routing_rules')
  .select('id, client_id, signal_type, conditions, action_type, action_payload, target_selector, variant_content')
  .order('client_id');
if (error) throw error;

let invalid = 0;
for (const rule of data || []) {
  const candidate = {
    signal_type: rule.signal_type,
    conditions: rule.conditions,
    action_type: rule.action_type,
    action_payload: rule.action_payload,
    target_selector: rule.target_selector,
    variant_content: rule.variant_content,
  };
  const result = createRuleRequestSchema.safeParse(candidate);
  if (!result.success) {
    invalid += 1;
    console.log(JSON.stringify({ rule_id: rule.id, client_id: rule.client_id, issues: result.error.issues.map((issue) => issue.message) }));
  }
}

console.log(`Audited ${(data || []).length} rules; ${invalid} invalid configuration(s). No data was changed.`);
if (invalid > 0) process.exitCode = 2;
