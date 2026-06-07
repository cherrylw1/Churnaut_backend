import { redis } from '@/lib/redis';
import { ScoutDeal, ScoutClosedLostDeal, ScoutClosedWonDeal, fetchClosedWonDeals } from './integrations/hubspot-pipeline';
import { supabaseAdmin } from '@/lib/supabase';

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
  deals: ScoutDeal[],
  bypassCache: boolean = false,
  patterns?: {
    avg_deal_cycle_days: number | null;
    avg_stage_duration: Record<string, number>;
    single_contact_close_rate: number;
    top_close_signals: string[] | string;
  } | null
): Promise<ScoutScoreResult> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  const cacheKey = `scout:scores:${clientId}`;

  // 1. Try Cache Read (skip if bypassCache is true)
  if (!bypassCache) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : (cached as ScoutScoreResult);
      }
    } catch (cacheErr) {
      console.error('[Scout Scoring Cache Read Error] Failed to read from Redis:', cacheErr);
    }
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

  let patternsLayer = '';
  if (patterns) {
    const cycleDays = patterns.avg_deal_cycle_days ?? 'unknown';
    const closeRate = patterns.single_contact_close_rate ?? 'unknown';
    const signals = Array.isArray(patterns.top_close_signals) 
      ? patterns.top_close_signals.join(', ') 
      : (patterns.top_close_signals || 'none');
    patternsLayer = `
### Layer 2.5: Company-specific Patterns
Company-specific patterns: Average deal cycle is ${cycleDays} days. Single-contact deals close at ${closeRate}% rate. Top close signals: ${signals}.
`;
  }

  const prompt = `
### Layer 1: System Context
You are Scout, an experienced B2B sales manager AI reviewing a sales pipeline. You are direct, specific, and actionable. You understand deal velocity, buying signals, and when deals are at risk.

### Layer 2: Scoring Framework
Score each deal RED, AMBER, or GREEN using these rules:
- **RED**: no activity 10+ days AND close date within 30 days, OR close date pushed back, OR single contact on deals over $10K, OR stuck in same stage 2x longer than average.
- **AMBER**: no activity 5-10 days, OR close date within 45 days with no recent activity, OR single contact regardless of deal size.
- **GREEN**: activity within 5 days, multiple contacts engaged, moving through stages normally.

If last_activity_days is null, treat it as 999 (no activity ever recorded). If contact_count is 0 or null, treat it as 0 contacts. Apply scoring rules normally with these substitutions — do not skip or omit deals because of missing data. Every deal in the input MUST appear in the output with a score.
${patternsLayer}
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
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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

/**
 * Calculates historical deal patterns for a client and saves them.
 * If fewer than 5 deals exist, returns null.
 */
export async function calculateDealPatterns(clientId: string) {
  if (!clientId) return null;

  try {
    console.log(`[calculateDealPatterns] Starting pattern calculation for client: ${clientId}`);
    const { data: dealScores, error } = await supabaseAdmin
      .from('deal_scores')
      .select('*')
      .eq('client_id', clientId);

    if (error) {
      console.error('[calculateDealPatterns] Error fetching deal scores:', error);
      return null;
    }

    if (!dealScores || dealScores.length < 5) {
      console.log(`[calculateDealPatterns] Not enough data for client ${clientId} (${dealScores?.length || 0} deals)`);
      return null;
    }

    // 1. Calculate avg_deal_cycle_days: average days from first scored_at to close_date
    let totalCycleDays = 0;
    let cycleDealsCount = 0;
    dealScores.forEach((d) => {
      if (d.close_date && d.scored_at) {
        const diffTime = new Date(d.close_date).getTime() - new Date(d.scored_at).getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        totalCycleDays += diffDays;
        cycleDealsCount++;
      }
    });
    const avg_deal_cycle_days = cycleDealsCount > 0 ? Math.round(totalCycleDays / cycleDealsCount) : null;

    // 2. Calculate avg_stage_duration: average days_in_stage grouped by stage
    const stageDurations: Record<string, { total: number; count: number }> = {};
    dealScores.forEach((d) => {
      if (d.stage && d.days_in_stage !== undefined && d.days_in_stage !== null) {
        if (!stageDurations[d.stage]) {
          stageDurations[d.stage] = { total: 0, count: 0 };
        }
        stageDurations[d.stage].total += d.days_in_stage;
        stageDurations[d.stage].count += 1;
      }
    });
    const avg_stage_duration: Record<string, number> = {};
    for (const [stage, data] of Object.entries(stageDurations)) {
      avg_stage_duration[stage] = Math.round(data.total / data.count);
    }

    // 3. Calculate close rate for single-contact deals
    const isClosed = (stage: string) => {
      const s = (stage || '').toLowerCase();
      return s.includes('won') || s.includes('closedwon');
    };

    const singleContactDeals = dealScores.filter((d) => (d.contact_count || 0) <= 1);
    const singleContactClosed = singleContactDeals.filter((d) => isClosed(d.stage));
    const single_contact_close_rate = singleContactDeals.length > 0
      ? Number(((singleContactClosed.length / singleContactDeals.length) * 100).toFixed(2))
      : 0;

    // 4. Calculate top_close_signals: stages that appear most on GREEN deals
    const greenDeals = dealScores.filter((d) => d.score === 'GREEN');
    const stageCounts: Record<string, number> = {};
    greenDeals.forEach((d) => {
      if (d.stage) {
        stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
      }
    });
    const top_close_signals = Object.entries(stageCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([stage]) => stage);

    const patternData = {
      client_id: clientId,
      avg_deal_cycle_days,
      avg_stage_duration,
      single_contact_close_rate,
      top_close_signals,
      calculated_at: new Date().toISOString(),
    };

    console.log(`[calculateDealPatterns] Upserting patterns for client ${clientId}:`, JSON.stringify(patternData));
    const { data: upsertData, error: upsertError } = await supabaseAdmin
      .from('company_deal_patterns')
      .upsert(patternData, { onConflict: 'client_id' })
      .select()
      .maybeSingle();

    if (upsertError) {
      console.error('[calculateDealPatterns] Error upserting pattern:', upsertError);
    }

    return upsertData || patternData;
  } catch (err) {
    console.error('[calculateDealPatterns] Exception in calculation:', err);
    return null;
  }
}

export async function generateDealObituary(
  clientId: string,
  deal: ScoutClosedLostDeal
): Promise<unknown> {
  if (!clientId || !deal || !deal.deal_id) {
    throw new Error('Missing client ID or deal details');
  }

  // 1. Check if an obituary already exists for this deal_id
  const { data: existing, error: findError } = await supabaseAdmin
    .from('deal_obituaries')
    .select('id')
    .eq('client_id', clientId)
    .eq('deal_id', deal.deal_id)
    .maybeSingle();

  if (findError) {
    console.error(`[Scout Obituary] Error searching for existing obituary for deal ${deal.deal_id}:`, findError);
  }

  if (existing) {
    console.log(`[Scout Obituary] Obituary already exists for deal ${deal.deal_id}, skipping generation.`);
    return existing;
  }

  // 2. Build Gemini prompt
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured in the environment');
  }

  const prompt = `
You are Scout, a B2B sales coach writing a deal post-mortem. Be direct, specific, and actionable.

Analyze the following closed-lost deal information:
- Deal ID: ${deal.deal_id}
- Deal Name: ${deal.deal_name}
- Stage Died In: ${deal.stage}
- Deal Value: $${deal.deal_value}
- Close Date: ${deal.close_date || 'Unknown'}
- Days in final stage: ${deal.days_in_stage}
- Days since last activity prior to loss: ${deal.last_activity_days ?? 'Unknown'}
- Total contacts engaged: ${deal.contact_count}

Write a post-mortem review of this lost deal.
You must respond with a single, valid JSON object containing exactly these keys at the root:
1. "likely_cause": a short summary of the likely cause of death (under 20 words).
2. "what_rep_could_do": actionable advice on what the representative could have done differently to save the deal (under 25 words).
3. "pattern_match": a short description referencing if this matches common loss patterns (e.g. lack of multithreading, stage stagnation, ghosting after pricing) (under 20 words).
4. "full_obituary": a detailed review (3-4 sentences, plain English, direct tone).

Return ONLY the JSON. No markdown wrappers (no \`\`\`json block), no conversational text, no explanations. Just raw JSON.
`;

  // 3. Invoke Gemini
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
    console.error(`[Scout Obituary API Error] Gemini returned status ${geminiRes.status}:`, errText);
    throw new Error(`Gemini API call failed: ${geminiRes.statusText}`);
  }

  const resData = await geminiRes.json();
  const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Invalid response structure from Gemini model');
  }

  let cleanedText = rawText.trim();
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }

  let parsed: {
    likely_cause: string;
    what_rep_could_do: string;
    pattern_match: string;
    full_obituary: string;
  };

  try {
    parsed = JSON.parse(cleanedText);
  } catch (parseErr) {
    console.error('[Scout Obituary Parse Error] Failed to parse JSON:', cleanedText, parseErr);
    throw new Error('Failed to parse Scout AI obituary response as valid JSON');
  }

  // 4. Upsert into deal_obituaries
  const insertData = {
    client_id: clientId,
    deal_id: deal.deal_id,
    deal_name: deal.deal_name,
    deal_value: deal.deal_value,
    close_date: deal.close_date,
    stage_died_in: deal.stage,
    days_in_final_stage: deal.days_in_stage,
    likely_cause: parsed.likely_cause || 'No clear cause identified.',
    what_rep_could_do: parsed.what_rep_could_do || 'Review deal timeline and activity history.',
    pattern_match: parsed.pattern_match || 'General loss pattern.',
    full_obituary: parsed.full_obituary || 'No detailed obituary generated.',
  };

  const { data: upsertData, error: upsertError } = await supabaseAdmin
    .from('deal_obituaries')
    .upsert(insertData, { onConflict: 'client_id,deal_id' })
    .select()
    .maybeSingle();

  if (upsertError) {
    console.error('[Scout Obituary] Error upserting obituary:', upsertError);
    throw upsertError;
  }

  return upsertData || insertData;
}

export async function buildICPFromWins(
  clientId: string
): Promise<{ icp_profile: unknown; rules_created: number; error?: string } | null> {
  if (!clientId) {
    throw new Error('Missing client ID');
  }

  // 1. Fetch closed-won deals
  const wonDeals: ScoutClosedWonDeal[] = await fetchClosedWonDeals(clientId);

  if (!wonDeals || wonDeals.length < 3) {
    return {
      icp_profile: null,
      rules_created: 0,
      error: 'Need at least 3 closed-won deals to build ICP',
    };
  }

  // 2. Perform Calculations
  const winCount = wonDeals.length;
  
  // Average deal value
  const totalValue = wonDeals.reduce((sum, d) => sum + d.deal_value, 0);
  const avgDealValue = totalValue / winCount;

  // Average days to close
  const totalDays = wonDeals.reduce((sum, d) => sum + d.days_to_close, 0);
  const avgDaysToClose = Math.round(totalDays / winCount);

  // Top 5 job titles
  const jobTitleCounts: Record<string, number> = {};
  wonDeals.flatMap(d => d.contact_job_titles).forEach(title => {
    if (title) {
      const normalized = title.trim();
      jobTitleCounts[normalized] = (jobTitleCounts[normalized] || 0) + 1;
    }
  });
  const topJobTitles = Object.entries(jobTitleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  // Top deal stages (most common stage sequences)
  const stageSequenceCounts: Record<string, number> = {};
  wonDeals.forEach(d => {
    const seqStr = d.stage_sequence.join(' -> ');
    stageSequenceCounts[seqStr] = (stageSequenceCounts[seqStr] || 0) + 1;
  });
  const topDealStages = Object.entries(stageSequenceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sequence, count]) => ({ sequence, count }));

  // 3. Gemini Prompt to build ICP Summary
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured in the environment');
  }

  const prompt = `
You are a B2B sales strategist. Based on these closed-won deals, write a crisp 3-sentence ICP (Ideal Customer Profile) summary. Be specific about job title, company type, deal size, and buying behavior.

Calculated patterns from closed-won deals:
- Total Won Deals: ${winCount}
- Average Deal Value: $${avgDealValue.toFixed(2)}
- Average Days to Close: ${avgDaysToClose} days
- Top Job Titles identified: ${JSON.stringify(topJobTitles)}
- Common Stage Sequences: ${JSON.stringify(topDealStages)}

Your response must be a single, plain-text string containing exactly the 3-sentence ICP summary. No JSON, no markdown wrappers, no conversational text, no explanations. Just the raw 3-sentence summary.
`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
    console.error(`[Scout ICP AI Error] Gemini returned status ${geminiRes.status}:`, errText);
    throw new Error(`Gemini API call failed: ${geminiRes.statusText}`);
  }

  const resData = await geminiRes.json();
  let icpSummary = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  icpSummary = icpSummary.trim();

  // Remove potential markdown code blocks if AI wrapped it
  if (icpSummary.startsWith('```')) {
    icpSummary = icpSummary.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }

  // 4. Upsert into icp_profiles
  const profileData = {
    client_id: clientId,
    top_job_titles: topJobTitles,
    top_industries: [],
    avg_deal_value: avgDealValue,
    avg_days_to_close: avgDaysToClose,
    top_deal_stages: topDealStages,
    win_count: winCount,
    icp_summary: icpSummary,
    generated_at: new Date().toISOString(),
  };

  const { data: upsertData, error: upsertError } = await supabaseAdmin
    .from('icp_profiles')
    .upsert(profileData, { onConflict: 'client_id' })
    .select()
    .maybeSingle();

  if (upsertError) {
    console.error('[Scout ICP] Error upserting ICP profile:', upsertError);
    throw upsertError;
  }

  const activeProfile = upsertData || profileData;

  // 5. Auto-generate routing rules for top job titles (up to 3)
  let rulesCreated = 0;
  const targetJobTitles = topJobTitles.slice(0, 3);

  if (targetJobTitles.length > 0) {
    // Fetch existing rules for client to check for duplicates and determine priority
    const { data: existingRules, error: rulesFetchError } = await supabaseAdmin
      .from('routing_rules')
      .select('conditions, priority')
      .eq('client_id', clientId);

    if (rulesFetchError) {
      console.error('[Scout ICP] Error fetching existing routing rules:', rulesFetchError);
    }

    const existingConditions = new Set(
      (existingRules || []).map((r) => {
        const conds = r.conditions || {};
        return conds.job_title_contains ? conds.job_title_contains.toLowerCase().trim() : '';
      }).filter(Boolean)
    );

    let maxPriority = (existingRules || []).reduce((max, r) => Math.max(max, r.priority || 0), 0);

    for (const jobTitleObj of targetJobTitles) {
      const jt = jobTitleObj.title;
      const normalizedJt = jt.toLowerCase().trim();

      if (!existingConditions.has(normalizedJt)) {
        maxPriority++;
        const newRule = {
          client_id: clientId,
          priority: maxPriority,
          active: true,
          signal_type: 'cold_email',
          conditions: {
            job_title_contains: jt,
          },
          action_type: 'swap_text',
          action_payload: {
            swaps: [
              {
                selector: 'h1',
                content: `Hey ${jt} — this page was built for you.`,
              }
            ]
          },
          target_selector: 'h1',
          variant_content: `Hey ${jt} — this page was built for you.`,
          created_at: new Date().toISOString(),
        };

        const { error: ruleInsertError } = await supabaseAdmin
          .from('routing_rules')
          .insert(newRule);

        if (ruleInsertError) {
          console.error(`[Scout ICP] Error inserting auto-rule for ${jt}:`, ruleInsertError);
        } else {
          rulesCreated++;
        }
      }
    }
  }

  return {
    icp_profile: activeProfile,
    rules_created: rulesCreated,
  };
}


