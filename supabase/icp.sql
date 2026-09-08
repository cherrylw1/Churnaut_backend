-- Create icp_profiles table
CREATE TABLE IF NOT EXISTS icp_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    top_job_titles jsonb,
    top_industries jsonb,
    avg_deal_value numeric,
    avg_days_to_close integer,
    top_deal_stages jsonb,
    win_count integer,
    icp_summary text,
    generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_client_id ON icp_profiles(client_id);

-- Enable RLS
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can view their own icp profiles" ON icp_profiles;
DROP POLICY IF EXISTS "Clients can manage their own icp profiles" ON icp_profiles;
CREATE POLICY "Clients can manage their own icp profiles" ON icp_profiles
    FOR ALL TO authenticated
    USING (client_id = (select auth.uid()))
    WITH CHECK (client_id = (select auth.uid()));
