// lib/scout/types.ts
//
// Normalized, CRM-agnostic signal schema for Scout deal intelligence.
// TYPES ONLY — no logic. Per-CRM adapters and the universal layer populate
// these shapes (later phases); the analyst prompt consumes them.

// ---------- shared enums ----------
export type CrmSource =
  | 'hubspot' | 'pipedrive' | 'close' | 'zoho' | 'salesforce' | 'attio' | 'none';

// Canonical funnel position so stages from different CRMs are comparable.
export type CanonicalStage =
  | 'lead' | 'qualified' | 'discovery' | 'evaluation' | 'proposal'
  | 'negotiation' | 'closing' | 'won' | 'lost' | 'unknown';

export type ActivityType = 'call' | 'meeting' | 'email' | 'note' | 'task' | 'other';
export type Seniority = 'c_level' | 'vp' | 'director' | 'manager' | 'ic' | 'unknown';
export type ScoutScore = 'RED' | 'AMBER' | 'GREEN';
export type Confidence = 'low' | 'medium' | 'high';
export type Availability = 'present' | 'partial' | 'missing';

// ---------- building blocks ----------
export interface ActivityEvent {
  type: ActivityType;
  occurred_at: string; // ISO timestamp
  summary?: string;
}

export interface DealContact {
  name?: string;
  email?: string;
  title?: string;
  seniority: Seniority;
  is_decision_maker?: boolean;
  last_engaged_at?: string;
}

export interface StageHistoryEntry {
  stage_raw: string;
  canonical: CanonicalStage;
  entered_at: string;
  days_in_stage?: number;
}

export interface CloseDateChange {
  from?: string;
  to: string;
  changed_at: string;
}

// ---------- universal layer (Churnaut-native; present for every customer) ----------
export interface WebsiteVisit {
  occurred_at: string;
  page?: string;
}

export interface WebsiteActivity {
  visits: WebsiteVisit[];
  visits_7d: number;
  visits_30d: number;
  last_visit_at?: string;
  trend: 'accelerating' | 'steady' | 'cooling' | 'none';
}

export type EntrySource =
  | 'cold_email' | 'ad' | 'referral' | 'organic' | 'outreach_tool' | 'unknown';

export interface TrackedLinkEngagement {
  clicks: number;
  last_click_at?: string;
  converted: boolean;
  personalization_fired: boolean;
}

export interface ProspectProfile {
  name?: string;
  email?: string;
  company?: string;
  title?: string;
  source_tool?: string; // e.g. 'instantly', 'smartlead'
}

export interface UniversalSignals {
  website: WebsiteActivity;
  entry_source: EntrySource;
  tracked_link: TrackedLinkEngagement;
  prospect: ProspectProfile;
}

// ---------- CRM layer (normalized; filled by a per-CRM adapter) ----------
export interface CrmSignals {
  source: CrmSource;
  deal_id: string;
  deal_name: string;
  owner_name?: string;
  owner_email?: string;
  value?: number;
  currency?: string;
  stage_raw?: string;
  stage_canonical: CanonicalStage;
  close_date?: string;
  created_at?: string;
  deal_age_days?: number;
  days_in_current_stage?: number;
  last_activity_at?: string;
  last_activity_type?: ActivityType;
  days_since_last_activity?: number;
  last_meeting_at?: string;
  next_meeting_at?: string;
  activity_timeline?: ActivityEvent[];
  contacts: DealContact[];
  stage_history?: StageHistoryEntry[];
  close_date_changes?: CloseDateChange[];
}

// ---------- priors (the customer's own history; fed alongside) ----------
export interface IcpProfile {
  avg_won_deal_value?: number;
  winning_titles?: string[];
  winning_signal_sequences?: string[];
  typical_won_cycle_days?: number;
}

export interface LossPattern {
  pattern: string;
  likely_cause?: string;
  stage_died_in?: CanonicalStage;
  example_count?: number;
}

export interface CompanyBenchmarks {
  avg_deal_cycle_days?: number;
  single_contact_close_rate?: number;
  avg_days_per_stage?: Partial<Record<CanonicalStage, number>>;
}

export interface ScoreTrajectoryPoint {
  scored_at: string;
  score: ScoutScore;
}

export interface Priors {
  icp?: IcpProfile;
  loss_patterns?: LossPattern[];
  benchmarks?: CompanyBenchmarks;
  score_trajectory?: ScoreTrajectoryPoint[];
}

// ---------- completeness (lets the model calibrate confidence) ----------
export interface SignalCompleteness {
  crm: Availability;
  activity: Availability;
  contacts: Availability;
  website: Availability;
  stage_history: Availability;
  priors: Availability;
}

// ---------- the full normalized deal (model INPUT) ----------
export interface NormalizedDeal {
  universal: UniversalSignals;
  crm: CrmSignals;
  priors: Priors;
  completeness: SignalCompleteness;
}

// ---------- the analyst brief (model OUTPUT) ----------
export interface ScoutBrief {
  deal_id: string;
  deal_name: string;
  score: ScoutScore;
  confidence: Confidence;
  reasoning: string;       // short, grounded in the evidence
  evidence: string[];      // specific data points the score rests on
  primary_risk: string;
  comparison?: string;     // e.g. "matches the loss pattern that killed deals X and Y"
  next_action: string;     // single highest-leverage action
  draft_message?: string;  // grounded; for RED/AMBER deals
  what_would_move_score?: string;
  data_gaps?: string[];
}

export interface ScoutAnalysis {
  pipeline_pressure_score: number; // 0-100
  briefs: ScoutBrief[];
}
