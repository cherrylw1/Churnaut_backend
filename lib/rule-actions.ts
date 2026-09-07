export const RULE_ACTIONS = ['show_calendar', 'inject_copy'] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export function isRuleAction(value: unknown): value is RuleAction {
  return typeof value === 'string' && (RULE_ACTIONS as readonly string[]).includes(value);
}
