import { parse } from 'css-what';

export function validateCssSelector(value: string): string {
  const selector = value.trim();
  if (!selector) throw new Error('Selector is required');
  if (selector.length > 500) throw new Error('Selector is too long');
  let groups: ReturnType<typeof parse>;
  try { groups = parse(selector); } catch { throw new Error('Selector is malformed'); }
  if (groups.length > 20 || groups.some((group) => group.length > 50)) throw new Error('Selector is too complex');
  if (groups.some((group) => group.some((token) => token.type === 'pseudo-element'))) throw new Error('Pseudo-elements cannot be personalized');
  return selector;
}

export function isSafeCssSelector(value: string): boolean {
  try { validateCssSelector(value); return true; } catch { return false; }
}
