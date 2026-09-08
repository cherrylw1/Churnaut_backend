import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { logLLMCall } from '@/lib/llm/logger';
import { generateText } from '@/lib/llm/complete';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import { copywriterRequestSchema, copywriterVariantsSchema, readJson } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const plan = await getClientPlan(req)
  const gate = planGate(plan, 'growth')
  if (gate) return gate

  try {
    // 1. Authenticate Client
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Body Parameters
    const parsedBody = await readJson(req, copywriterRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { signal_type, job_title, industry, company_size, desired_tone } = parsedBody.data;

    // 3. Build normalized cache key
    const normSignal = signal_type.toString().toLowerCase().trim();
    const normJob = job_title.toString().toLowerCase().trim();
    const normInd = industry.toString().toLowerCase().trim();
    const normSize = company_size.toString().toLowerCase().trim();
    const normTone = desired_tone.toString().toLowerCase().trim();
    
    const cacheKey = `copywriter:${normSignal}:${normJob}:${normInd}:${normSize}:${normTone}`;

    // 4. Check Redis Cache (30-day TTL)
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const variants = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return NextResponse.json({ success: true, source: 'cache', variants });
      }
    } catch (cacheErr) {
      logError('[Copywriter Cache Error] Redis check failed:', cacheErr);
      // Soft fail: continue to query Gemini
    }

    // 5. Call Together AI API

    const prompt = `You are a B2B SaaS copywriter specializing in high-converting CTA copy for sales-led growth companies. Generate exactly 5 short CTA variants for a website button. Context: Signal type is ${signal_type}. The visitor's job title is ${job_title}. Their industry is ${industry}. Company size is ${company_size}. Desired tone is ${desired_tone}. Each variant should be under 10 words. Output only a JSON array of 5 strings. No explanation, no preamble, no markdown.`;

    const llmStart = Date.now();
    let rawText: string;
    try { rawText = await generateText(prompt, { maxTokens: 1200, context: { feature: 'copywriter', scope: 'customer', clientId } }); }
    catch (error) { logError('[Copywriter AI] unavailable:', error instanceof Error ? error.message : 'unknown'); return NextResponse.json({ success: false, degraded: true, error: 'ai_unavailable', message: 'AI copy is temporarily unavailable; enter the copy manually.' }); }

    // 6. Clean Markdown formatting out of JSON response
    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let variants: string[] = [];
    try {
      variants = copywriterVariantsSchema.parse(JSON.parse(cleanedText));
    } catch (parseErr) {
      logError('[Copywriter Parse Error] Failed to validate model response:', parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response as a JSON list' }, { status: 502 });
    }

    logLLMCall({
      client_id: clientId,
      feature: 'copywriter',
      metadata: { variant_count: variants.length, result: 'generated' },
      latency_ms: Date.now() - llmStart,
    });

    // 7. Write to Redis cache with 30-day TTL (2,592,000 seconds)
    try {
      await redis.setex(cacheKey, 2592000, JSON.stringify(variants));
    } catch (cacheSetErr) {
      logError('[Copywriter Cache Set Error] Redis write failed:', cacheSetErr);
    }

    return NextResponse.json({ success: true, source: 'model', variants });

  } catch (err) {
    logError('[Copywriter Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
