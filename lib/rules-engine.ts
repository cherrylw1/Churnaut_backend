import { RoutingRule, Session } from '../types';

/**
 * Iterates through routing rules in order and returns the first rule where all conditions match the session data.
 * @param sessionData - The active session row from Supabase or null
 * @param rules - Array of routing rules from Supabase sorted by priority
 * @returns The matching routing rule or null
 */
export function evaluateRules(
  sessionData: Session | null,
  rules: RoutingRule[]
): RoutingRule | null {
  if (!rules || rules.length === 0) {
    return null;
  }

  const session = sessionData || ({} as Session);

  for (const rule of rules) {
    // 1. Check signal_type match if the rule specifies it
    if (rule.signal_type && rule.signal_type !== session.signal_type) {
      continue;
    }

    // 2. Check conditions inside the conditions object
    let isMatch = true;
    const conditions = rule.conditions;

    if (conditions && typeof conditions === 'object' && !Array.isArray(conditions)) {
      // Evaluate job_title_contains (case-insensitive substring match)
      if ('job_title_contains' in conditions) {
        const targetJob = (conditions.job_title_contains ?? '').toString().toLowerCase().trim();
        const sessionJob = (session.job_title ?? '').toString().toLowerCase().trim();
        if (!sessionJob.includes(targetJob)) {
          isMatch = false;
        }
      }

      // Evaluate company_name_equals (exact string match)
      if (isMatch && 'company_name_equals' in conditions) {
        const targetCompany = (conditions.company_name_equals ?? '').toString().trim();
        const sessionCompany = (session.company_name ?? '').toString().trim();
        if (sessionCompany !== targetCompany) {
          isMatch = false;
        }
      }
    }

    if (isMatch) {
      return rule;
    }
  }

  return null;
}
