-- ==========================================
-- 10. DEAL SCORES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS deal_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text NOT NULL,
    deal_name text,
    stage text,
    deal_value numeric,
    close_date date,
    days_in_stage integer,
    last_activity_days integer,
    contact_count integer,
    website_visits_7d integer,
    score text CHECK (score IN ('RED', 'AMBER', 'GREEN')),
    primary_risk text,
    next_action text,
    draft_email text,
    created_at timestamptz DEFAULT now(),
    scored_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_scores_client_id ON deal_scores(client_id);

ALTER TABLE deal_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own deal scores" ON deal_scores
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own deal scores" ON deal_scores
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ==========================================
-- 11. PIPELINE SNAPSHOTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS pipeline_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    total_deals integer DEFAULT 0,
    red_count integer DEFAULT 0,
    amber_count integer DEFAULT 0,
    green_count integer DEFAULT 0,
    total_pipeline_value numeric DEFAULT 0,
    pressure_score integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_snapshots_client_id ON pipeline_snapshots(client_id);

ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own pipeline snapshots" ON pipeline_snapshots
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own pipeline snapshots" ON pipeline_snapshots
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ==========================================
-- 12. SCOUT NUDGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS scout_nudges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text,
    deal_name text,
    rep_email text,
    rep_name text,
    message text,
    sent boolean DEFAULT false,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_nudges_client_id ON scout_nudges(client_id);

ALTER TABLE scout_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own scout nudges" ON scout_nudges
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own scout nudges" ON scout_nudges
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
