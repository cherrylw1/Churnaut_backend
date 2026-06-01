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

-- ==========================================
-- 7. PLAYBOOK TEMPLATES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS playbook_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    signal_type text,
    tier integer,
    required_inputs jsonb DEFAULT '[]',
    rule_template jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- SEED PLAYBOOK TEMPLATES
INSERT INTO playbook_templates (name, description, signal_type, tier, required_inputs, rule_template) VALUES 
('Tracked Link VIP Prospect', 'Personalize the page for a known prospect arriving via a tracked link. Show rep calendar and inject their name.', 'cold_email', 1, '[{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. Sarah Chen","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Personalized Headline","placeholder":"e.g. Hey {{prospect_name}}, we know why you are here.","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('LinkedIn Lead Gen Form', 'When a prospect fills your LinkedIn Lead Gen Form, personalize their landing page instantly with full identity.', 'linkedin_lead_gen', 1, '[{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Thank You Headline","placeholder":"e.g. Thanks {{prospect_name}}, book a time below.","type":"text"}]', '{"signal_type":"linkedin_lead_gen","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('HubSpot Deal Stage', 'Route visitors differently based on their current deal stage in HubSpot.', 'cold_email', 1, '[{"field_name":"deal_stage","label":"Deal Stage Value","placeholder":"e.g. proposal_sent","type":"text"},{"field_name":"headline","label":"Stage-Specific Headline","placeholder":"e.g. Ready to move forward?","type":"text"},{"field_name":"cta_url","label":"CTA URL","placeholder":"https://yoursite.com/pricing","type":"text"}]', '{"signal_type":"cold_email","conditions":{"deal_stage_equals":"{{deal_stage}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Returning Visitor', 'Show personalized content to visitors returning via their first-party cookie.', 'returning_visitor', 1, '[{"field_name":"headline","label":"Return Visit Headline","placeholder":"e.g. Welcome back, {{prospect_name}}","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Continue where you left off","type":"text"}]', '{"signal_type":"returning_visitor","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Cold Email Sequence', 'Personalize for prospects arriving from your cold email outreach. Show rep calendar and skip the generic form.', 'cold_email', 2, '[{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. James Wilson","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"sequence_name","label":"Sequence Name","placeholder":"e.g. Q2 Enterprise Outreach","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{rep_name}} is ready to talk — book a time below."}'), 
('Google Ads Keyword', 'Match your landing page headline to the exact keyword a visitor searched before clicking your ad.', 'google_ad', 2, '[{"field_name":"keyword_theme","label":"Keyword Theme","placeholder":"e.g. HubSpot alternative","type":"text"},{"field_name":"headline","label":"Matching Headline","placeholder":"e.g. The HubSpot alternative built for revenue teams","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Start free trial","type":"text"}]', '{"signal_type":"google_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Campaign', 'Route visitors based on the UTM campaign tag in their URL. Works with any ad platform.', 'cold_email', 2, '[{"field_name":"campaign_name","label":"UTM Campaign Value","placeholder":"e.g. enterprise-q2","type":"text"},{"field_name":"headline","label":"Campaign Headline","placeholder":"e.g. Built for enterprise revenue teams","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See enterprise pricing","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_campaign_contains":"{{campaign_name}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('LinkedIn Ad Persona', 'Show persona-specific messaging to visitors arriving from your LinkedIn ad campaigns.', 'linkedin_ad', 2, '[{"field_name":"persona_name","label":"Persona Name","placeholder":"e.g. VP of Marketing","type":"text"},{"field_name":"headline","label":"Persona Headline","placeholder":"e.g. Built for marketing leaders like you","type":"text"},{"field_name":"case_study_url","label":"Case Study URL","placeholder":"https://yoursite.com/case-study","type":"text"}]', '{"signal_type":"linkedin_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('CRM Webhook Deal Stage', 'Automatically route visitors when their CRM deal stage changes via webhook. Works with any CRM.', 'cold_email', 2, '[{"field_name":"deal_stage","label":"Deal Stage Value","placeholder":"e.g. negotiation","type":"text"},{"field_name":"headline","label":"Stage Headline","placeholder":"e.g. Ready to finalize the details?","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Book a call with your account executive","type":"text"}]', '{"signal_type":"cold_email","conditions":{"deal_stage_equals":"{{deal_stage}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Meta Ads Audience', 'Personalize for visitors arriving from Facebook or Instagram ad campaigns.', 'meta_ad', 3, '[{"field_name":"audience_name","label":"Audience Name","placeholder":"e.g. Retargeting — Visited Pricing","type":"text"},{"field_name":"headline","label":"Audience Headline","placeholder":"e.g. Still thinking it over? Here is what others say.","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Start your free trial","type":"text"}]', '{"signal_type":"meta_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('TikTok Ads Campaign', 'Personalize for visitors arriving from TikTok ad campaigns.', 'tiktok_ad', 3, '[{"field_name":"campaign_name","label":"Campaign Name","placeholder":"e.g. B2B Awareness Q2","type":"text"},{"field_name":"headline","label":"Campaign Headline","placeholder":"e.g. You saw us on TikTok. Here is the full story.","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See how it works","type":"text"}]', '{"signal_type":"tiktok_ad","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Source', 'Route differently based on which platform sent the traffic — LinkedIn, Google, email, and more.', 'cold_email', 3, '[{"field_name":"source_name","label":"UTM Source Value","placeholder":"e.g. linkedin","type":"text"},{"field_name":"headline","label":"Source Headline","placeholder":"e.g. Thanks for coming from LinkedIn","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See what others from LinkedIn think","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_source_equals":"{{source_name}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('UTM Content Variant', 'Route based on which ad creative a visitor clicked. Perfect for multivariate testing.', 'cold_email', 3, '[{"field_name":"content_tag","label":"UTM Content Value","placeholder":"e.g. creative-a","type":"text"},{"field_name":"headline","label":"Variant Headline","placeholder":"e.g. You clicked our best performing ad","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. See why it works","type":"text"}]', '{"signal_type":"cold_email","conditions":{"utm_content_contains":"{{content_tag}}"},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Existing Customer Upsell', 'Hide acquisition CTAs for existing customers and show expansion or upgrade messaging instead.', 'cold_email', 3, '[{"field_name":"upsell_feature","label":"Feature to Upsell","placeholder":"e.g. Advanced Analytics","type":"text"},{"field_name":"upgrade_url","label":"Upgrade URL","placeholder":"https://yoursite.com/upgrade","type":"text"},{"field_name":"headline","label":"Upsell Headline","placeholder":"e.g. Unlock Advanced Analytics for your team","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"existing_customer"},"action_type":"inject_copy","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('Churned Customer Win-back', 'Show a win-back offer to customers who cancelled and are now revisiting your site.', 'cold_email', 3, '[{"field_name":"offer_text","label":"Win-back Offer","placeholder":"e.g. Come back and get 2 months free","type":"text"},{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"headline","label":"Win-back Headline","placeholder":"e.g. We have made a lot of improvements since you left","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"churned"},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{headline}}"}'), 
('Conference QR Code', 'When a prospect scans your QR code at a conference, skip all forms and show your rep calendar directly.', 'qr_code', 4, '[{"field_name":"event_name","label":"Event Name","placeholder":"e.g. SaaStr Annual 2026","type":"text"},{"field_name":"rep_name","label":"Rep Name","placeholder":"e.g. Marcus Lee","type":"text"},{"field_name":"calendly_url","label":"Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"}]', '{"signal_type":"qr_code","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"Great meeting you at {{event_name}}. Book a time with {{rep_name}} below."}'), 
('Webinar Follow-up', 'Personalize for attendees clicking your post-webinar follow-up email link.', 'cold_email', 4, '[{"field_name":"webinar_topic","label":"Webinar Topic","placeholder":"e.g. RevOps Automation in 2026","type":"text"},{"field_name":"case_study_url","label":"Related Case Study URL","placeholder":"https://yoursite.com/case-study","type":"text"},{"field_name":"calendly_url","label":"Rep Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"}]', '{"signal_type":"cold_email","conditions":{},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"Thanks for attending our webinar on {{webinar_topic}}. Ready to see how this applies to your team?"}'), 
('G2 or Capterra Referral', 'Visitors from review sites are actively comparing vendors. Skip awareness content and show a direct comparison.', 'g2_referral', 4, '[{"field_name":"competitor_names","label":"Top Competitors","placeholder":"e.g. Mutiny, Qualified","type":"text"},{"field_name":"trial_url","label":"Free Trial URL","placeholder":"https://yoursite.com/trial","type":"text"},{"field_name":"headline","label":"Comparison Headline","placeholder":"e.g. See how we compare to Mutiny and Qualified","type":"text"}]', '{"signal_type":"g2_referral","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"{{headline}}"}'), 
('Partner Referral', 'Show a co-branded experience for visitors arriving via a partner or affiliate referral link.', 'partner_referral', 4, '[{"field_name":"partner_name","label":"Partner Name","placeholder":"e.g. HubSpot Solutions Partner","type":"text"},{"field_name":"offer_text","label":"Partner Offer","placeholder":"e.g. Exclusive 20% discount for HubSpot partners","type":"text"},{"field_name":"partner_logo_url","label":"Partner Logo URL","placeholder":"https://yoursite.com/partner-logo.png","type":"text"}]', '{"signal_type":"partner_referral","conditions":{},"action_type":"inject_copy","target_selector":"#headline","variant_content":"Welcome from {{partner_name}}. {{offer_text}}"}'), 
('Free Trial User', 'When a trial user visits your marketing site, show them a targeted upgrade CTA instead of a generic demo form.', 'cold_email', 4, '[{"field_name":"locked_feature","label":"Feature to Unlock","placeholder":"e.g. CRM Enrichment","type":"text"},{"field_name":"calendly_url","label":"Sales Calendly URL","placeholder":"https://calendly.com/your-link","type":"text"},{"field_name":"cta_text","label":"CTA Text","placeholder":"e.g. Talk to sales to unlock CRM Enrichment","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"trial_user"},"action_type":"show_calendar","target_selector":"#main-cta","variant_content":"{{cta_text}}"}'), 
('Freemium Usage Limit', 'When a freemium user hits their usage limit and lands on your site, show them exactly the plan that solves their problem.', 'cold_email', 4, '[{"field_name":"plan_name","label":"Plan Name","placeholder":"e.g. Growth Plan","type":"text"},{"field_name":"upgrade_url","label":"Upgrade URL","placeholder":"https://yoursite.com/pricing","type":"text"},{"field_name":"limit_description","label":"Limit Description","placeholder":"e.g. You have used all 5 tracked links this month","type":"text"}]', '{"signal_type":"cold_email","conditions":{"visitor_type_equals":"freemium"},"action_type":"inject_copy","target_selector":"#main-cta","variant_content":"{{limit_description}}. Upgrade to {{plan_name}} to unlock unlimited tracked links."}');

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
