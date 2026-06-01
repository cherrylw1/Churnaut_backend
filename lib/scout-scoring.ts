import { redis } from '@/lib/redis';
import { ScoutDeal } from './integrations/hubspot-pipeline';

export interface ScoredDeal {
  deal_id: string;
  deal_name: string;
  score: 'RED' | 'AMBER' | 'GREEN';
  primary_risk: string;
  next_action: string;
  draft_email?: string | null;
}

export interface ScoutScoreResult {
  pipeline_pressure_score: number;
  deals: ScoredDeal[];
}

/**
 * Scores a client's pipeline deals using Gemini 2.5 Flash-Lite based on a structured rubric.
 * Calculates an overall Pipeline Pressure Score and drafts re-engagement emails for RED deals.
 * Caches the output in Redis for 1 hour.
 */
export async function scoreDealsWithScout(
  clientId: string,
  deals: ScoutDeal[]
): Promise<ScoutScoreResult> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  const cacheKey = `scout:scores:${clientId}`;

  // 1. Try Cache Read
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : (cached as ScoutScoreResult);
    }
  } catch (cacheErr) {
    console.error('[Scout Scoring Cache Read Error] Failed to read from Redis:', cacheErr);
  }

  // If there are no deals, return a default empty score result
  if (!deals || deals.length === 0) {
    const emptyResult: ScoutScoreResult = {
      pipeline_pressure_score: 0,
      deals: [],
    };
    // Cache the empty result too
    try {
      await redis.set(cacheKey, JSON.stringify(emptyResult), { ex: 3600 });
    } catch (cacheErr) {
      console.error('[Scout Scoring Cache Write Error] Failed to write empty result:', cacheErr);
    }
    return emptyResult;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured in the environment');
  }

  // 2. Build Structured Three-Layer Prompt
  const currentDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const currentIsoDate = new Date().toISOString().split('T')[0];

  const prompt = `
### Layer 1: System Context
You are Scout, an experienced B2B sales manager AI reviewing a sales pipeline. You are direct, specific, and actionable. You understand deal velocity, buying signals, and when deals are at risk.

### Layer 2: Scoring Framework
Score each deal RED, AMBER, or GREEN using these rules:
- **RED**: no activity 10+ days AND close date within 30 days, OR close date pushed back, OR single contact on deals over $10K, OR stuck in same stage 2x longer than average.
- **AMBER**: no activity 5-10 days, OR close date within 45 days with no recent activity, OR single contact regardless of deal size.
- **GREEN**: activity within 5 days, multiple contacts engaged, moving through stages normally.

If last_activity_days is null, treat it as 999 (no activity ever recorded). If contact_count is 0 or null, treat it as 0 contacts. Apply scoring rules normally with these substitutions — do not skip or omit deals because of missing data. Every deal in the input MUST appear in the output with a score.

### Layer 3: Deal Data and Output Schema
Here is the current date and timezone context:
- Current Date: ${currentDateStr} (ISO: ${currentIsoDate})

Here is the JSON list of deals in the pipeline to analyze:
${JSON.stringify(deals, null, 2)}

Calculate the "Pipeline Pressure Score" as an integer from 0 to 100. Base it on:
- Percentage of deals scored GREEN (lowers pressure score, positive signal)
- Percentage of deals scored RED (increases pressure score, negative signal)
- Average days to close date across all deals (closer dates increase pressure)
- Total pipeline value weighted by score (more value in RED/AMBER increases pressure)

Your response must be a single, valid JSON object containing exactly two keys at the root:
1. "pipeline_pressure_score": integer (0 to 100)
2. "deals": an array of objects, where each object represents a scored deal and contains exactly these fields:
   - "deal_id": string (must match the deal's input ID)
   - "deal_name": string
   - "score": string (must be exactly "RED", "AMBER", or "GREEN")
   - "primary_risk": string (one specific sentence identifying the risk, under 15 words)
   - "next_action": string (one specific action the rep should take today, under 20 words)
   - "draft_email": string or null (only for RED deals — generate a 3-sentence re-engagement email the rep can send immediately, subject line included. Set to null or omit for AMBER and GREEN deals).

Return ALL deals passed in. Never return an empty deals array if deals were provided. Every deal in the input MUST appear in the output with a score.
Return ONLY the JSON. No markdown wrappers, no conversational text, no explanations, no preamble. Just raw JSON.
`;

  // 3. Invoke Gemini 2.5 Flash-Lite API
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
    console.error(`[Scout Scoring API Error] Gemini returned status ${geminiRes.status}:`, errText);
    throw new Error(`Gemini API call failed: ${geminiRes.statusText}`);
  }

  const resData = await geminiRes.json();
  console.log('GEMINI RAW RESPONSE:', JSON.stringify(resData, null, 2));
  const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.error('[Scout Scoring Error] Empty response structure from Gemini:', JSON.stringify(resData));
    throw new Error('Invalid response structure from Gemini model');
  }

  // 4. Parse and Clean response JSON
  let cleanedText = rawText.trim();
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }

  console.log('[Scout Scoring] String to be parsed with JSON.parse:', cleanedText);

  let parsed: { pipeline_pressure_score: number; deals: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(cleanedText);
    if (typeof parsed.pipeline_pressure_score !== 'number' || !Array.isArray(parsed.deals)) {
      throw new Error('Parsed object is missing required root fields');
    }
  } catch (parseErr) {
    const parseErrMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const parseErrStack = parseErr instanceof Error ? parseErr.stack : '';
    console.error(`[Scout Scoring Parse Error Details] Error: ${parseErrMsg}\nStack: ${parseErrStack}`);
    console.error('[Scout Scoring Parse Error] Failed to parse JSON content:', cleanedText, parseErr);
    throw new Error('Failed to parse Scout AI scoring response as valid JSON object');
  }

  // Ensure all deals have deal_id mapped correctly and values validated
  const scoredDeals: ScoredDeal[] = parsed.deals.map((scoredDeal) => ({
    deal_id: (scoredDeal.deal_id as string) || '',
    deal_name: (scoredDeal.deal_name as string) || 'Unnamed Deal',
    score: (['RED', 'AMBER', 'GREEN'].includes(scoredDeal.score as string) ? scoredDeal.score : 'AMBER') as 'RED' | 'AMBER' | 'GREEN',
    primary_risk: (scoredDeal.primary_risk as string) || 'No direct risk identified.',
    next_action: (scoredDeal.next_action as string) || 'Review deal status.',
    draft_email: (scoredDeal.score as string) === 'RED' ? ((scoredDeal.draft_email as string) || null) : null,
  }));

  const result: ScoutScoreResult = {
    pipeline_pressure_score: parsed.pipeline_pressure_score,
    deals: scoredDeals,
  };

  // 5. Cache result in Redis for 1 hour (3600 seconds)
  try {
    await redis.set(cacheKey, JSON.stringify(result), { ex: 3600 });
  } catch (cacheErr) {
    console.error('[Scout Scoring Cache Set Error] Failed to cache scores in Redis:', cacheErr);
  }

  return result;
}
