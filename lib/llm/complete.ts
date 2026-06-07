/* eslint-disable @typescript-eslint/no-explicit-any */
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';

// Model is configurable via env so we can swap/upgrade without code changes.
export const DEFAULT_MODEL = process.env.TOGETHER_MODEL || 'moonshotai/Kimi-K2.6';

export interface GenOpts {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Generate text via Together AI (OpenAI-compatible chat completions).
 * Returns the raw assistant text. Throws on a non-OK response.
 */
export async function generateText(prompt: string, opts: GenOpts = {}): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.3,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    throw new Error(`Together AI error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;
  let content: string = msg?.content || '';
  // Some models place their answer in a reasoning field instead of content.
  if (!content) {
    content = msg?.reasoning_content || msg?.reasoning || '';
  }
  if (!content) {
    console.error('[LLM empty content]', JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      finish_reason: choice?.finish_reason,
      message_keys: msg ? Object.keys(msg) : null,
      usage: data.usage,
      raw_snippet: JSON.stringify(data).slice(0, 1000),
    }));
  }
  return content;
}

function stripFences(s: string): string {
  return s.replace(/```json/gi, '').replace(/```/g, '').trim();
}

/**
 * Generate strict JSON. Tries once; if JSON.parse fails, retries ONCE with a
 * stricter instruction at temperature 0. Returns the raw string and the parsed object.
 * Throws if both attempts fail to parse.
 */
export async function generateJSON(prompt: string, opts: GenOpts = {}): Promise<{ raw: string; parsed: any }> {
  let raw = await generateText(prompt, opts);
  try {
    return { raw, parsed: JSON.parse(stripFences(raw)) };
  } catch {
    raw = await generateText(
      `${prompt}\n\nReturn ONLY valid minified JSON — no prose, no markdown, no code fences.`,
      { ...opts, temperature: 0 }
    );
    return { raw, parsed: JSON.parse(stripFences(raw)) };
  }
}
