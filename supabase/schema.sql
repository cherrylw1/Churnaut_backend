-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. CLIENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    company_name text NOT NULL,
    domain text NOT NULL UNIQUE,
    plan text DEFAULT 'starter',
    snippet_key text UNIQUE DEFAULT gen_random_uuid()::text,
    crm_type text,
    crm_api_key text,
    calendly_token text,
    stripe_customer_id text,
    active boolean DEFAULT true
);

-- ==========================================
-- 2. SESSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz,
    prospect_name text,
    prospect_email text,
    company_name text,
    job_title text,
    signal_type text,
    assigned_rep text,
    calendar_url text,
    crm_deal_id text,
    deal_stage text,
    visitor_type text,
    clicked_at timestamptz,
    click_count integer DEFAULT 0,
    converted boolean DEFAULT false,
    converted_at timestamptz,
    visitor_token text UNIQUE
);

-- ==========================================
-- 3. ROUTING RULES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS routing_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    priority integer NOT NULL,
    active boolean DEFAULT true,
    signal_type text,
    conditions jsonb DEFAULT '{}',
    action_type text NOT NULL,
    action_payload jsonb DEFAULT '{}',
    target_selector text,
    variant_content text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ==========================================
-- 4. ANALYTICS EVENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS analytics_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    session_id text REFERENCES sessions(id) ON DELETE SET NULL,
    rule_id uuid REFERENCES routing_rules(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    signal_type text,
    created_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_client_id ON routing_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority ON routing_rules(client_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_id ON analytics_events(client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- CLIENTS POLICIES
-- Dashboard user can manage their own client profile.
-- (Assumes auth.uid() corresponds to the client ID or client owner user ID)
CREATE POLICY "Clients can view their own profile" ON clients
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Clients can update their own profile" ON clients
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- SESSIONS POLICIES
CREATE POLICY "Clients can view their own sessions" ON sessions
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own sessions" ON sessions
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- PUBLIC ACCESS: Allow creation and updates of sessions from the snippet JS client matching the snippet_key
CREATE POLICY "Snippet can create sessions" ON sessions
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Snippet can update sessions" ON sessions
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- ROUTING RULES POLICIES
CREATE POLICY "Clients can view their own routing rules" ON routing_rules
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own routing rules" ON routing_rules
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- PUBLIC ACCESS: Allow snippet to read active rules
CREATE POLICY "Snippet can view active routing rules" ON routing_rules
    FOR SELECT TO anon, authenticated
    USING (active = true);

-- ANALYTICS EVENTS POLICIES
CREATE POLICY "Clients can view their own analytics events" ON analytics_events
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

-- PUBLIC ACCESS: Allow snippet to insert analytics tracking events
CREATE POLICY "Snippet can insert analytics events" ON analytics_events
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- ==========================================
-- 5. WEBHOOK MAPPINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    external_field text NOT NULL,
    internal_field text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- INDEX FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_client_id ON webhook_mappings(client_id);

-- RLS POLICIES FOR WEBHOOK MAPPINGS
ALTER TABLE webhook_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own webhook mappings" ON webhook_mappings
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own webhook mappings" ON webhook_mappings
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ==========================================
-- 6. CRM TOKENS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS crm_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
    crm_type text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- INDEX FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_crm_tokens_client_id_crm_type ON crm_tokens(client_id, crm_type);

-- RLS POLICIES FOR CRM TOKENS
ALTER TABLE crm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own crm tokens" ON crm_tokens
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own crm tokens" ON crm_tokens
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

