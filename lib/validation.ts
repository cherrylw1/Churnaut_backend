import { z } from 'zod';
import { isSafeCssSelector } from '@/lib/css-selector';
import { RULE_ACTIONS } from '@/lib/rule-actions';

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableString = (max: number) => z.string().trim().max(max).nullable().optional();
const selector = z.string().trim().min(1).max(500).refine(isSafeCssSelector, 'Invalid CSS selector');
const httpUrl = z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), 'URL must use http or https');
const httpsUrl = z.string().trim().url().refine((value) => value.startsWith('https://'), 'URL must use HTTPS');
const trackingValue = z.string().trim().min(1).max(1000).nullable().optional();
const swapSchema = z.object({ selector, content: z.string().max(10000) }).strict();
const actionPayloadSchema = z.object({
  calendar_url: httpsUrl.optional(),
  swaps: z.array(swapSchema).min(1).max(20).optional(),
  content: z.string().max(10000).optional(),
  variant_content: z.string().max(10000).optional(),
  selector: selector.optional(),
  use_session_calendar: z.boolean().optional(),
}).strict();
const conditionSchema = z.record(z.string(), z.string().trim().min(1).max(500)).refine((value) => {
  const supported = new Set(['job_title_contains','company_name_equals','deal_stage_equals','visitor_type_equals','utm_campaign_contains','utm_source_equals','utm_medium_equals','utm_content_contains']);
  return Object.keys(value).every((key) => supported.has(key));
}, 'Unsupported or empty rule condition');

export const resolveRequestSchema = z.object({
  client_id: boundedString(200),
  cookie: z.string().max(500).nullable().optional(),
  signals: z.object({ sid: trackingValue, gclid: trackingValue, fbclid: trackingValue, li_fat_id: trackingValue, ttclid: trackingValue }).strict().optional().default({}),
  utms: z.object({ utm_source: trackingValue, utm_medium: trackingValue, utm_campaign: trackingValue, utm_content: trackingValue, utm_term: trackingValue }).strict().optional().default({}),
  page_url: z.string().url().max(4000).refine((value) => /^https?:\/\//i.test(value), 'Page URL must use http or https').optional(),
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
  conditions: conditionSchema.optional(),
  action_type: z.enum(RULE_ACTIONS),
  action_payload: actionPayloadSchema.optional(),
  target_selector: selector.nullable().optional(),
  variant_content: z.string().max(10000).nullable().optional(),
};

function validateCanonicalRule(rule: {
  action_type?: string;
  action_payload?: Record<string, unknown>;
  target_selector?: string | null;
  variant_content?: string | null;
}, ctx: z.RefinementCtx) {
  if (rule.action_type === 'show_calendar') {
    if (!rule.target_selector) ctx.addIssue({ code: 'custom', path: ['target_selector'], message: 'Calendar rules require a target selector' });
    if (!rule.action_payload?.calendar_url && rule.action_payload?.use_session_calendar !== true) {
      ctx.addIssue({ code: 'custom', path: ['action_payload'], message: 'Calendar rules require an HTTPS calendar URL or use_session_calendar' });
    }
  }
  if (rule.action_type === 'inject_copy') {
    const swaps = rule.action_payload?.swaps;
    const hasSwaps = Array.isArray(swaps) && swaps.length > 0;
    const hasLegacyPair = !!rule.target_selector && typeof rule.variant_content === 'string' && rule.variant_content.length > 0;
    if (!hasSwaps && !hasLegacyPair) ctx.addIssue({ code: 'custom', path: ['action_payload'], message: 'Copy rules require at least one selector/content swap' });
  }
}

export const createRuleRequestSchema = z.object(ruleFields).strict().superRefine(validateCanonicalRule);
export function isCanonicalRuleConfiguration(rule: {
  signal_type?: string | null;
  conditions?: unknown;
  action_type?: unknown;
  action_payload?: unknown;
  target_selector?: unknown;
  variant_content?: unknown;
}): boolean {
  return createRuleRequestSchema.safeParse({
    signal_type: rule.signal_type,
    conditions: rule.conditions,
    action_type: rule.action_type,
    action_payload: rule.action_payload,
    target_selector: rule.target_selector,
    variant_content: rule.variant_content,
  }).success;
}
export const updateRuleRequestSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  signal_type: nullableString(100),
  conditions: conditionSchema.optional(),
  action_type: z.enum(RULE_ACTIONS).optional(),
  action_payload: actionPayloadSchema.optional(),
  target_selector: selector.nullable().optional(),
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
  conditions: conditionSchema.optional().default({}),
  action_type: z.enum(RULE_ACTIONS),
  action_payload: actionPayloadSchema.optional().default({}),
  target_selector: selector.nullable().optional(),
  variant_content: z.string().max(10000).nullable().optional(),
}).strict().superRefine(validateCanonicalRule);

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
  calendar_url: httpsUrl.max(2000).nullable().optional().or(z.literal('')),
  destination_url: httpUrl.max(2000),
  expires_in_days: z.coerce.number().int().min(1).max(3650).nullable().optional(),
}).strict();

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(10000) }).strict()).max(20).optional().default([]),
}).strict();

export const alertPatchRequestSchema = z.object({ id: z.string().uuid() }).strict();

export const clientDomainRequestSchema = z.object({ domain: httpUrl.max(2000) }).strict();
export const snippetPingRequestSchema = z.object({ client_id: boundedString(200) }).strict();
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
