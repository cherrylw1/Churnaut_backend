import { z } from 'zod';

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableString = (max: number) => z.string().trim().max(max).nullable().optional();
const jsonObject = z.record(z.string(), z.unknown());

export const resolveRequestSchema = z.object({
  client_id: boundedString(200),
  cookie: z.string().max(500).nullable().optional(),
  signals: jsonObject.optional().default({}),
  utms: jsonObject.optional().default({}),
}).strict();

export const webhookPayloadSchema = z.record(z.string().max(100), z.unknown()).refine(
  (payload) => Object.keys(payload).length <= 100,
  'Webhook payload cannot contain more than 100 top-level fields'
);

export const signupRequestSchema = z.object({
  userId: z.string().uuid(),
  companyName: boundedString(200),
  email: z.string().email().max(320).optional().or(z.literal('')),
}).strict();

const ruleFields = {
  signal_type: nullableString(100),
  conditions: jsonObject.optional(),
  action_type: z.enum(['show_calendar', 'inject_copy']),
  action_payload: jsonObject.optional(),
  target_selector: z.string().trim().max(500).nullable().optional(),
  variant_content: z.string().max(10000).nullable().optional(),
};

export const createRuleRequestSchema = z.object(ruleFields).strict();
export const updateRuleRequestSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  signal_type: nullableString(100),
  conditions: jsonObject.optional(),
  action_type: z.enum(['show_calendar', 'inject_copy']).optional(),
  action_payload: jsonObject.optional(),
  target_selector: z.string().trim().max(500).nullable().optional(),
  variant_content: z.string().max(10000).nullable().optional(),
}).strict();
export const reorderRulesRequestSchema = z.object({
  rules: z.array(z.object({ id: z.string().uuid(), priority: z.number().int().positive() }).strict()).min(1).max(500),
}).strict();

export const webhookMappingRequestSchema = z.object({
  external_field: boundedString(200),
  internal_field: boundedString(100),
}).strict();

export const copywriterRequestSchema = z.object({
  signal_type: z.string().trim().max(100).optional().default('Cold Email'),
  job_title: z.string().trim().max(200).optional().default('Executive'),
  industry: z.string().trim().max(200).optional().default('Software'),
  company_size: z.string().trim().max(100).optional().default('50-200'),
  desired_tone: z.string().trim().max(100).optional().default('consultative'),
}).strict();

export const onboardingRequestSchema = z.object({
  crm: z.string().trim().max(100).optional(),
  ideal_customer: z.string().trim().max(1000).optional(),
  company_size: z.string().trim().max(100).optional(),
  channels: z.array(z.string().trim().max(100)).max(50).optional(),
  problem: z.string().trim().max(1000).optional(),
}).strict();

export const generatedRuleSchema = z.object({
  priority: z.number().int().positive(),
  active: z.boolean().optional().default(true),
  signal_type: z.string().trim().max(100).nullable().optional(),
  conditions: jsonObject.optional().default({}),
  action_type: z.enum(['show_calendar', 'inject_copy']),
  action_payload: jsonObject.optional().default({}),
  target_selector: z.string().trim().max(500).nullable().optional(),
  variant_content: z.string().max(10000).nullable().optional(),
}).strict();

export const nudgeRequestSchema = z.object({
  deal_id: z.string().max(200).nullable().optional(),
  deal_name: z.string().trim().max(500).nullable().optional(),
  rep_email: z.string().email().max(320).nullable().optional().or(z.literal('')),
  rep_name: z.string().trim().max(200).nullable().optional(),
  message: z.string().trim().max(5000).nullable().optional(),
}).strict();

export const authSessionRequestSchema = z.object({
  access_token: z.string().min(1).max(4096),
  expires_at: z.number().int().positive().optional(),
}).strict();

export const linksRequestSchema = z.object({
  prospect_name: z.string().trim().max(200).nullable().optional(),
  prospect_email: z.string().email().max(320).nullable().optional().or(z.literal('')),
  company_name: z.string().trim().max(200).nullable().optional(),
  job_title: z.string().trim().max(200).nullable().optional(),
  signal_type: z.string().trim().max(100).nullable().optional(),
  assigned_rep: z.string().trim().max(200).nullable().optional(),
  calendar_url: z.string().url().max(2000).nullable().optional().or(z.literal('')),
  destination_url: z.string().url().max(2000),
  expires_in_days: z.coerce.number().int().min(1).max(3650).nullable().optional(),
}).strict();

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(10000) }).strict()).max(20).optional().default([]),
}).strict();

export const alertPatchRequestSchema = z.object({ id: z.string().uuid() }).strict();

export const clientDomainRequestSchema = z.object({ domain: z.string().trim().min(1).max(2000) }).strict();
export const founderChatCreateSchema = z.object({ title: z.string().trim().min(1).max(200), messages: z.array(z.unknown()).max(200) }).strict();
export const founderChatUpdateSchema = z.object({ id: z.string().uuid(), messages: z.array(z.unknown()).max(200) }).strict();

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<
  { ok: true; data: T } | { ok: false; error: string }
> {
  try {
    const raw: unknown = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ') };
    }
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }
}
