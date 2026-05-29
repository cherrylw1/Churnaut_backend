import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Helper to extract authenticated client_id from cookie session
function getClientId(req: NextRequest): string | null {
  const cookie = req.cookies.get('sb-auth-token');
  if (!cookie) return null;
  try {
    const session = JSON.parse(decodeURIComponent(cookie.value));
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Client
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Body Parameters
    const body = await req.json();
    const {
      signal_type = 'Cold Email',
      job_title = 'Executive',
      industry = 'Software',
      company_size = '50-200',
      desired_tone = 'consultative',
    } = body;

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
      console.error('[Copywriter Cache Error] Redis check failed:', cacheErr);
      // Soft fail: continue to query Gemini
    }

    // 5. Call Gemini 2.5 Flash-Lite API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const prompt = `You are a B2B SaaS copywriter specializing in high-converting CTA copy for sales-led growth companies. Generate exactly 5 short CTA variants for a website button. Context: Signal type is ${signal_type}. The visitor's job title is ${job_title}. Their industry is ${industry}. Company size is ${company_size}. Desired tone is ${desired_tone}. Each variant should be under 10 words. Output only a JSON array of 5 strings. No explanation, no preamble, no markdown.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[Copywriter Gemini Error] API returned status:', geminiRes.status, errText);
      return NextResponse.json({ error: `Gemini API call failed: ${geminiRes.statusText}` }, { status: 502 });
    }

    const resData = await geminiRes.json();
    const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error('[Copywriter Gemini Error] Empty response structure:', JSON.stringify(resData));
      return NextResponse.json({ error: 'Invalid response from Gemini model' }, { status: 502 });
    }

    // 6. Clean Markdown formatting out of JSON response
    let cleanedText = rawText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
    }

    let variants: string[] = [];
    try {
      variants = JSON.parse(cleanedText);
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new Error('Parsed object is not a non-empty array');
      }
    } catch (parseErr) {
      console.error('[Copywriter Parse Error] Failed to parse JSON content:', cleanedText, parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response as a JSON list' }, { status: 502 });
    }

    // 7. Write to Redis cache with 30-day TTL (2,592,000 seconds)
    try {
      await redis.setex(cacheKey, 2592000, JSON.stringify(variants));
    } catch (cacheSetErr) {
      console.error('[Copywriter Cache Set Error] Redis write failed:', cacheSetErr);
    }

    return NextResponse.json({ success: true, source: 'gemini', variants });

  } catch (err) {
    console.error('[Copywriter Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
