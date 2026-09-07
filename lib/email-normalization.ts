import { z } from 'zod';

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  return z.string().email().safeParse(normalized).success ? normalized : null;
}
