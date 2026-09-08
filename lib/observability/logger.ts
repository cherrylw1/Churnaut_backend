import { redactSensitive } from './redact.ts';

export type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, event: string, context: unknown[] = []): void {
  const details = context.length === 0 ? {} : context.length === 1 && context[0] && typeof context[0] === 'object' ? context[0] : { details: context };
  const record = redactSensitive({
    event,
    level,
    timestamp: new Date().toISOString(),
    ...(details as Record<string, unknown>),
  });
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, ...context: unknown[]): void { emit('info', event, context); }
export function logWarn(event: string, ...context: unknown[]): void { emit('warn', event, context); }
export function logError(event: string, ...context: unknown[]): void { emit('error', event, context); }

export function safeErrorContext(error: unknown): LogContext {
  if (error instanceof Error) return { error_name: error.name, error_message: error.message.slice(0, 240) };
  return { error: String(error).slice(0, 240) };
}
