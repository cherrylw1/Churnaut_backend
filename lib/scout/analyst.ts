/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateJSON } from '@/lib/llm/complete';
import type { NormalizedDeal, ScoutBrief, ScoutScore, Confidence } from './types';

const ANALYST_SYSTEM = `You are Scout, a senior B2B sales analyst. You assess ONE deal at a time from structured signals and produce a rigorous, evidence-grounded brief for the rep who owns it. You are sharp, specific, and honest about uncertainty.

HOW TO REASON (weigh these together — do NOT apply rigid thresholds):
- Momentum: recency and TYPE of last activity (a booked meeting is strong; an auto-logged email is weak), and the website-visit trend (accelerating vs cooling).
- Stakeholders: how many contacts, their seniority, and whether the deal is single-threaded (one contact = fragile). A decision-maker engaged is a strong sign.
- Velocity: days in the current stage versus the company's average deal cycle; a deal sitting far longer than normal is stalling.
- Engagement: tracked-link clicks, conversions, whether personalization fired, and the entry source.
- Fit vs WINS: compare to the client's ICP / winning profile when provided.
- Risk vs LOSSES: compare to the client's loss patterns when provided — if this deal resembles how past deals died, say so explicitly.
- Trajectory: if score_trajectory is present, weigh whether the deal is improving or deteriorating over time — a deal sliding toward RED is a stronger warning than a stable score.

SCORING (judgment, not thresholds):
- GREEN: healthy momentum, adequate stakeholder coverage, on or ahead of normal pace.
- AMBER: real warning signs that need attention soon.
- RED: serious risk of slipping or being lost without intervention.

CONFIDENCE — calibrate to the completeness flags provided:
- Key signals present -> you may be "high".
- Important signals "partial"/"missing" -> use "medium" or "low" and name what's missing in data_gaps.
- Never project false certainty on thin data.

OUTPUT RULES:
- Cite SPECIFIC evidence from the data (e.g. "9 days since last activity", "single-threaded", "visited 4x in 3 days"). Do NOT invent facts not present in the input.
- "comparison" references a matching loss pattern or ICP fit ONLY when priors are present; otherwise return "".
- "next_action" is the ONE highest-leverage, specific next move.
- "draft_message" is a short, grounded outreach draft referencing real specifics — include it for RED and AMBER, return "" for GREEN.
- "what_would_move_score" is the single lever that would most improve this deal.
- "data_gaps" lists missing/partial signals that would sharpen the assessment.
- Day-counts such as days_in_current_stage and days_since_last_activity are provided as numbers — cite them directly. Do NOT compute durations from timestamps yourself.
- Be concise. Ground everything in the provided data.

Respond with ONLY a JSON object (no prose, no markdown) with exactly these keys:
{"score":"RED|AMBER|GREEN","confidence":"low|medium|high","reasoning":"string","evidence":["string"],"primary_risk":"string","comparison":"string","next_action":"string","draft_message":"string","what_would_move_score":"string","data_gaps":["string"]}`;

function asScore(v: any): ScoutScore {
  const s = String(v || '').toUpperCase();
  return s === 'RED' || s === 'GREEN' ? (s as ScoutScore) : 'AMBER';
}
function asConfidence(v: any): Confidence {
  const s = String(v || '').toLowerCase();
  return s === 'high' || s === 'medium' ? (s as Confidence) : 'low';
}
function asStringArray(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

export async function analyzeDealWithScout(deal: NormalizedDeal): Promise<ScoutBrief> {
  const prompt = `Analyze this deal and return the JSON brief.\n\nDEAL SIGNALS (JSON):\n${JSON.stringify(deal)}`;
  const { parsed } = await generateJSON(prompt, {
    system: ANALYST_SYSTEM,
    maxTokens: 1500,
    temperature: 0.3,
  });
  const p = (parsed || {}) as any;
  return {
    deal_id: deal.crm.deal_id,
    deal_name: deal.crm.deal_name,
    score: asScore(p.score),
    confidence: asConfidence(p.confidence),
    reasoning: typeof p.reasoning === 'string' ? p.reasoning : '',
    evidence: asStringArray(p.evidence),
    primary_risk: typeof p.primary_risk === 'string' ? p.primary_risk : '',
    comparison: typeof p.comparison === 'string' && p.comparison.trim() ? p.comparison : undefined,
    next_action: typeof p.next_action === 'string' ? p.next_action : '',
    draft_message: typeof p.draft_message === 'string' && p.draft_message.trim() ? p.draft_message : undefined,
    what_would_move_score: typeof p.what_would_move_score === 'string' && p.what_would_move_score.trim() ? p.what_would_move_score : undefined,
    data_gaps: asStringArray(p.data_gaps),
  };
}
