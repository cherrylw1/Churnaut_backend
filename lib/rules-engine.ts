import { RoutingRule, Session } from '../types/index';

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
    if (rule.signal_type) {
      const normalize = (val: string | null | undefined) => {
        return (val || '').toString().toLowerCase().trim().replace(/\s+/g, '_');
      };
      if (normalize(rule.signal_type) !== normalize(session.signal_type)) {
        continue;
      }
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

      // Evaluate deal_stage_equals (exact match, case-insensitive)
      if (isMatch && 'deal_stage_equals' in conditions) {
        const targetStage = (conditions.deal_stage_equals ?? '').toString().toLowerCase().trim();
        const sessionStage = ((session as unknown as Record<string, string>).deal_stage ?? '').toString().toLowerCase().trim();
        if (sessionStage !== targetStage) {
          isMatch = false;
        }
      }

      // Evaluate visitor_type_equals (exact match, case-insensitive)
      if (isMatch && 'visitor_type_equals' in conditions) {
        const targetType = (conditions.visitor_type_equals ?? '').toString().toLowerCase().trim();
        const sessionType = ((session as unknown as Record<string, string>).visitor_type ?? '').toString().toLowerCase().trim();
        if (sessionType !== targetType) {
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
