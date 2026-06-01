-- ==========================================
-- 13. COMPANY DEAL PATTERNS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS company_deal_patterns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    avg_deal_cycle_days integer,
    avg_stage_duration jsonb,
    single_contact_close_rate numeric,
    top_close_signals jsonb,
    calculated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_client_id UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_company_deal_patterns_client_id ON company_deal_patterns(client_id);

ALTER TABLE company_deal_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own company deal patterns" ON company_deal_patterns
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own company deal patterns" ON company_deal_patterns
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
