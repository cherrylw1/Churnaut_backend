import { logAIProviderAttempt } from './logger';
import { classifyAIError, AIError } from './errors';
import { getAIPolicy, estimateInputTokens, type AIContext } from './policy';
import { reserveBudget, settleBudget } from './budget';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const TOGETHER_EMBED_URL = 'https://api.together.xyz/v1/embeddings';
export const DEFAULT_MODEL = process.env.TOGETHER_MODEL || 'moonshotai/Kimi-K2.6';
export const EMBED_MODEL = process.env.TOGETHER_EMBED_MODEL || 'intfloat/multilingual-e5-large-instruct';

export interface GenOpts { system?: string; temperature?: number; maxTokens?: number; model?: string; thinking?: boolean; jsonMode?: boolean; context: AIContext; requestId?: string; maxAttempts?: number; fallbackRequest?: boolean }
export interface ChatMessage { role: string; content: string }
const logicalRequestId = (opts: { requestId?: string }) => opts.requestId || crypto.randomUUID();

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new AIError('timeout', 'AI provider request timed out', { cause: error }); throw new AIError('provider_error', 'AI provider unavailable', { cause: error }); }
  finally { clearTimeout(timer); }
}
const usageFrom = (data: any) => ({ input: Number(data?.usage?.prompt_tokens || 0), output: Number(data?.usage?.completion_tokens || 0) });
const pricedCost = (model: string, input: number, output: number) => { const inRate = Number(process.env[`AI_${model.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_INPUT_MICROS_PER_MILLION`] || process.env.AI_INPUT_COST_MICROS_PER_MILLION || 0); const outRate = Number(process.env[`AI_${model.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_OUTPUT_MICROS_PER_MILLION`] || process.env.AI_OUTPUT_COST_MICROS_PER_MILLION || 0); return inRate > 0 && outRate > 0 ? Math.ceil((input * inRate + output * outRate) / 1_000_000) : undefined; };

async function runProvider(messages: ChatMessage[], opts: GenOpts, operation: 'chat' | 'embedding') {
  const context = opts.context; const policy = getAIPolicy(context.feature, operation, opts.maxTokens); const id = logicalRequestId(opts);
  if (process.env.AI_PROVIDER_DISABLED === 'true') throw new AIError('provider_disabled', 'AI provider is temporarily disabled');
  const primary = opts.model || (operation === 'embedding' ? EMBED_MODEL : DEFAULT_MODEL); const fallback = process.env.TOGETHER_FALLBACK_MODEL?.trim() || '';
  const models = operation === 'embedding' ? [primary, primary] : [primary, primary, ...(fallback && fallback !== primary ? [fallback] : [])]; const maxAttempts = Math.min(opts.maxAttempts ?? policy.maxAttempts, models.length);
  const effectiveMessages = [...messages]; const latestUser = [...effectiveMessages].reverse().find(m => m.role === 'user');
  const requiredTokens = estimateInputTokens(effectiveMessages.filter(m => m.role === 'system').concat(latestUser ? [latestUser] : []).map(m => m.content).join('\n'));
  if (requiredTokens > policy.maxInputTokens) throw new AIError('input_budget_exceeded', 'AI input exceeds the configured limit');
  while (estimateInputTokens(effectiveMessages.map(m => m.content).join('\n')) > policy.maxInputTokens) { const removable = effectiveMessages.findIndex((m) => m.role !== 'system' && m !== latestUser); if (removable < 0) break; effectiveMessages.splice(removable, 1); }
  const inputTokens = estimateInputTokens(effectiveMessages.map(m => m.content).join('\n')); if (inputTokens > policy.maxInputTokens) throw new AIError('input_budget_exceeded', 'AI input exceeds the configured limit');
  let lastError: AIError | null = null;
  for (let index = 0; index < maxAttempts; index++) {
    const model = models[index] || primary; const fallbackUsed = model !== primary || !!opts.fallbackRequest; const started = Date.now(); const reservation = await reserveBudget({ context, requestId: crypto.randomUUID(), provider: 'together', model, inputTokens, maxOutputTokens: policy.maxOutputTokens });
    if (!reservation.allowed && reservation.enforce) { await logAIProviderAttempt({ client_id: context.scope === 'customer' ? context.clientId : undefined, feature: context.feature, scope: context.scope, provider: 'together', operation, model, request_id: id, attempt: index + 1, fallback_used: fallbackUsed, status: 'budget_denied', latency_ms: 0, input_tokens: inputTokens, output_tokens: 0, reservation_id: reservation.id, error_code: 'budget_denied' }); throw new AIError('budget_denied', 'AI budget exceeded'); }
    try {
      const body: Record<string, unknown> = operation === 'embedding' ? { model, input: effectiveMessages[0]?.content || '' } : { model, messages: effectiveMessages, max_tokens: policy.maxOutputTokens, temperature: opts.temperature ?? 0.3, top_p: 0.9 };
      if (opts.jsonMode && operation === 'chat') body.response_format = { type: 'json_object' }; if (operation === 'chat') body.chat_template_kwargs = { thinking: opts.thinking ?? false };
      const response = await fetchWithTimeout(operation === 'embedding' ? TOGETHER_EMBED_URL : TOGETHER_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` }, body: JSON.stringify(body) }, policy.timeoutMs);
      if (!response.ok) throw new AIError(classifyAIError(response.status), `AI provider request failed (${response.status})`);
      const data = await response.json(); const usage = usageFrom(data); const usedInput = usage.input || inputTokens; const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || ''; const usedOutput = usage.output || (operation === 'chat' ? estimateInputTokens(content) : 0); const vector = operation === 'embedding' ? data.data?.[0]?.embedding : null; if (operation === 'embedding' && !Array.isArray(vector)) throw new AIError('invalid_response', 'AI embedding response was invalid');
      const measuredCost = pricedCost(model, usedInput, usedOutput); const telemetryCost = measuredCost ?? (reservation.reservedCostMicros || undefined); const usageSource = measuredCost !== undefined ? (usage.input || usage.output ? 'provider' : 'estimated') : (reservation.reservedCostMicros ? 'reserved_upper_bound' : 'pricing_missing');
      await logAIProviderAttempt({ client_id: context.scope === 'customer' ? context.clientId : undefined, feature: context.feature, scope: context.scope, provider: 'together', operation, model, request_id: id, attempt: index + 1, fallback_used: fallbackUsed, status: 'success', latency_ms: Date.now() - started, input_tokens: usedInput, output_tokens: usedOutput, estimated_cost_micros: telemetryCost, usage_source: usageSource, reservation_id: reservation.id, finish_reason: data?.choices?.[0]?.finish_reason });
      await settleBudget(reservation.id, { inputTokens: usedInput, outputTokens: usedOutput, status: 'settled' }); return { data, model, attempts: index + 1, fallbackUsed: model !== primary };
    } catch (error) {
      lastError = error instanceof AIError ? error : new AIError('provider_error', 'AI provider unavailable', { cause: error }); const failureStatus = lastError.code === 'timeout' ? 'timeout' : lastError.code === 'invalid_response' ? 'invalid_response' : 'provider_error';
      const disposition = lastError.retryable || lastError.code === 'invalid_response' ? 'expired_charged' : 'released';
      await logAIProviderAttempt({ client_id: context.scope === 'customer' ? context.clientId : undefined, feature: context.feature, scope: context.scope, provider: 'together', operation, model, request_id: id, attempt: index + 1, fallback_used: fallbackUsed, status: failureStatus, latency_ms: Date.now() - started, input_tokens: inputTokens, output_tokens: 0, estimated_cost_micros: disposition === 'released' ? undefined : (reservation.reservedCostMicros || undefined), usage_source: disposition === 'released' ? 'pricing_missing' : (reservation.reservedCostMicros ? 'reserved_upper_bound' : 'pricing_missing'), reservation_id: reservation.id, error_code: lastError.code });
      await settleBudget(reservation.id, { inputTokens, outputTokens: 0, status: disposition }); if (!lastError.retryable || index + 1 >= maxAttempts) break; await new Promise(resolve => setTimeout(resolve, 250 + Math.floor(Math.random() * 500)));
    }
  }
  throw lastError || new AIError('provider_error', 'AI provider unavailable');
}

export async function generateChat(messages: ChatMessage[], opts: GenOpts): Promise<string> { const result = await runProvider(messages, opts, 'chat'); const msg = result.data?.choices?.[0]?.message; return msg?.content || msg?.reasoning_content || msg?.reasoning || ''; }
export async function embed(text: string, opts: { type?: 'query' | 'document'; context: AIContext; requestId?: string }): Promise<number[]> { const input = opts.type === 'query' ? `Instruct: Given a question, retrieve the most relevant passages that answer it.\nQuery: ${text}` : text; const result = await runProvider([{ role: 'user', content: input }], { context: opts.context, requestId: opts.requestId, maxTokens: 0 }, 'embedding'); return result.data.data[0].embedding as number[]; }
export async function generateText(prompt: string, opts: GenOpts): Promise<string> { const messages: ChatMessage[] = []; if (opts.system) messages.push({ role: 'system', content: opts.system }); messages.push({ role: 'user', content: prompt }); return generateChat(messages, opts); }
const stripFences = (s: string) => s.replace(/```json/gi, '').replace(/```/g, '').trim();
export async function generateJSON(prompt: string, opts: GenOpts): Promise<{ raw: string; parsed: any }> { const id = opts.requestId || crypto.randomUUID(); const configuredFallback = process.env.TOGETHER_FALLBACK_MODEL?.trim() || opts.model; const repairModel = configuredFallback || DEFAULT_MODEL; const repairPrompt = `${prompt}\n\nReturn ONLY valid minified JSON — no prose, no markdown, no code fences.`; let raw: string; let usedFallback = false; let repairAlreadyAttempted = false; try { raw = await generateText(prompt, { ...opts, requestId: id, jsonMode: true, maxAttempts: Math.min(opts.maxAttempts ?? 2, 2) }); } catch (error) { const providerError = error instanceof AIError ? error : new AIError('provider_error', 'AI provider unavailable', { cause: error }); if (!providerError.retryable) throw providerError; repairAlreadyAttempted = true; usedFallback = Boolean(configuredFallback && configuredFallback !== (opts.model || DEFAULT_MODEL)); raw = await generateText(repairPrompt, { ...opts, model: repairModel, fallbackRequest: usedFallback, requestId: crypto.randomUUID(), jsonMode: true, temperature: 0, maxAttempts: 1 }); } try { return { raw, parsed: JSON.parse(stripFences(raw)) }; } catch { if (repairAlreadyAttempted || usedFallback) throw new AIError('invalid_response', 'AI provider returned invalid JSON'); raw = await generateText(repairPrompt, { ...opts, model: repairModel, fallbackRequest: Boolean(repairModel !== (opts.model || DEFAULT_MODEL)), requestId: crypto.randomUUID(), temperature: 0, jsonMode: true, maxAttempts: 1 }); try { return { raw, parsed: JSON.parse(stripFences(raw)) }; } catch { throw new AIError('invalid_response', 'AI provider returned invalid JSON'); } } }
