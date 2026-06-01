-- ==========================================
-- 8. ANOMALY ALERTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    alert_text text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    created_at timestamptz DEFAULT now(),
    read boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_client_id ON anomaly_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_read ON anomaly_alerts(client_id, read);

ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own anomaly alerts" ON anomaly_alerts
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can update their own anomaly alerts" ON anomaly_alerts
    FOR UPDATE TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ==========================================
-- 9. WEEKLY DIGESTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS weekly_digests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    summary text NOT NULL,
    top_signal text NOT NULL,
    rep_spotlight text NOT NULL,
    recommendation text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_digests_client_id ON weekly_digests(client_id);

ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own weekly digests" ON weekly_digests
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own weekly digests" ON weekly_digests
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
