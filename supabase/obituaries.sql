-- Create deal_obituaries table
CREATE TABLE IF NOT EXISTS deal_obituaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    deal_id text,
    deal_name text,
    deal_value numeric,
    close_date text,
    stage_died_in text,
    days_in_final_stage integer,
    likely_cause text,
    what_rep_could_do text,
    pattern_match text,
    full_obituary text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT unique_client_deal UNIQUE (client_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_obituaries_client_id ON deal_obituaries(client_id);

-- Enable RLS
ALTER TABLE deal_obituaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own deal obituaries" ON deal_obituaries
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own deal obituaries" ON deal_obituaries
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
