import { z } from 'zod'

const signalMetricSchema = z.object({
  signal: z.string(),
  total: z.number().int().nonnegative(),
  converted: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
}).superRefine((metric, context) => {
  if (metric.converted > metric.total) {
    context.addIssue({ code: 'custom', message: 'Converted sessions cannot exceed total sessions' })
  }
})

const repMetricSchema = z.object({
  rep: z.string(),
  conversions: z.number().int().nonnegative(),
})

const ruleMetricSchema = z.object({
  rule_id: z.string(),
  triggers: z.number().int().nonnegative(),
})

const digestPeriodSchema = z.object({
  links_created: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  triggers: z.number().int().nonnegative(),
  signals: z.array(signalMetricSchema),
  reps: z.array(repMetricSchema),
  rules: z.array(ruleMetricSchema),
})

const digestAggregateSchema = z.object({
  current: digestPeriodSchema,
  previous: digestPeriodSchema,
})

export type DigestPeriod = z.infer<typeof digestPeriodSchema>
export type DigestAggregate = z.infer<typeof digestAggregateSchema>
export type DigestSignalMetric = z.infer<typeof signalMetricSchema>

export function parseDigestAggregate(value: unknown): DigestAggregate | null {
  const parsed = digestAggregateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function selectTopSignal(signals: DigestSignalMetric[]): DigestSignalMetric | null {
  return [...signals].sort((a, b) =>
    b.rate - a.rate ||
    b.converted - a.converted ||
    b.total - a.total ||
    a.signal.localeCompare(b.signal)
  )[0] || null
}

export function selectBestRep(reps: DigestPeriod['reps']): DigestPeriod['reps'][number] | null {
  return [...reps].sort((a, b) =>
    b.conversions - a.conversions || a.rep.localeCompare(b.rep)
  )[0] || null
}

export function selectBestRule(rules: DigestPeriod['rules']): DigestPeriod['rules'][number] | null {
  return [...rules].sort((a, b) =>
    b.triggers - a.triggers || a.rule_id.localeCompare(b.rule_id)
  )[0] || null
}
