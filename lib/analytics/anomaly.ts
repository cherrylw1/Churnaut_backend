import { z } from 'zod'

const periodSchema = z.object({
  visitors: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
}).superRefine((period, context) => {
  if (period.conversions > period.visitors) {
    context.addIssue({ code: 'custom', message: 'Conversions cannot exceed visitors' })
  }
})

const anomalyAggregateSchema = z.object({
  current: periodSchema,
  previous: periodSchema,
  rule_daily: z.array(z.object({
    rule_id: z.string(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    count: z.number().int().nonnegative(),
  })),
})

export type AnomalyAggregate = z.infer<typeof anomalyAggregateSchema>

export function parseAnomalyAggregate(value: unknown): AnomalyAggregate | null {
  const parsed = anomalyAggregateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
