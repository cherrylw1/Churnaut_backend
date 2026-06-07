export type Plan = 'starter' | 'growth' | 'pro'

export const VARIANT_TO_PLAN: Record<string, Plan> = {
  '1757564': 'starter',
  '1757539': 'starter',
  '1757578': 'growth',
  '1757543': 'growth',
  '1757573': 'pro',
  '1757550': 'pro',
}

export const PLAN_LIMITS = {
  starter: {
    tracked_visits: 500,
    routing_rules: 5,
    domains: 1,
    bulk_csv: false,
    scout_ai: false,
    weekly_digest: false,
    ai_copywriter: false,
    crms: ['hubspot'],
    ad_signals: false,
    outreach_signals: ['instantly', 'smartlead', 'apollo', 'lemlist'],
  },
  growth: {
    tracked_visits: 5000,
    routing_rules: Infinity,
    domains: 3,
    bulk_csv: true,
    scout_ai: true,
    weekly_digest: true,
    ai_copywriter: true,
    crms: ['hubspot', 'pipedrive', 'zoho', 'close'],
    ad_signals: true,
    outreach_signals: ['instantly', 'smartlead', 'apollo', 'lemlist', 'linkedin', 'g2', 'partner'],
  },
  pro: {
    tracked_visits: Infinity,
    routing_rules: Infinity,
    domains: 10,
    bulk_csv: true,
    scout_ai: true,
    weekly_digest: true,
    ai_copywriter: true,
    crms: ['hubspot', 'pipedrive', 'zoho', 'close'],
    ad_signals: true,
    outreach_signals: ['instantly', 'smartlead', 'apollo', 'lemlist', 'linkedin', 'g2', 'partner'],
    zapier: true,
    multi_rep: true,
  },
}

export function getPlanLimits(plan: Plan | null) {
  if (!plan) return PLAN_LIMITS.starter
  return PLAN_LIMITS[plan]
}

export function canAccessFeature(plan: Plan | null, feature: keyof typeof PLAN_LIMITS.growth): boolean {
  const limits = getPlanLimits(plan)
  const value = limits[feature as keyof typeof limits]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (Array.isArray(value)) return value.length > 0
  return false
}
