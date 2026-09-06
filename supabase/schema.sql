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
    plan_status text DEFAULT 'active',
    monthly_visits integer DEFAULT 0,
    snippet_key text UNIQUE DEFAULT gen_random_uuid()::text,
    webhook_secret uuid DEFAULT gen_random_uuid(),
    email text,
    crm_type text,
    crm_api_key text,
    calendly_token text,
    stripe_customer_id text,
    lemonsqueezy_customer_id text,
    lemonsqueezy_subscription_id text,
    lemonsqueezy_variant_id text,
    trial_ends_at timestamptz,
    visits_reset_at timestamptz,
    active boolean DEFAULT true
);

-- Provision the tenant row inside the same transaction as the Supabase Auth
-- user. A profile failure aborts sign-up, preventing orphaned auth accounts.
CREATE OR REPLACE FUNCTION public.handle_new_churnaut_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    company_label text;
    company_slug text;
BEGIN
    company_label := COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'company_name'), ''), 'Workspace');
    company_slug := LEFT(REGEXP_REPLACE(LOWER(company_label), '[^a-z0-9]', '', 'g'), 40);
    IF company_slug = '' THEN company_slug := 'workspace'; END IF;

    INSERT INTO public.clients (id, company_name, domain, email, plan, active)
    VALUES (
        NEW.id,
        company_label,
        company_slug || '-' || LEFT(NEW.id::text, 8) || '.com',
        LOWER(NEW.email),
        'starter',
        true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_churnaut_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS on_auth_user_created_create_churnaut_client ON auth.users;
CREATE TRIGGER on_auth_user_created_create_churnaut_client
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_churnaut_user();

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
CREATE INDEX IF NOT EXISTS idx_clients_lower_email ON clients (lower(email));
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_client_id ON routing_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority ON routing_rules(client_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_id ON analytics_events(client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);

-- Atomic quota consumption used by the public resolve endpoint.
CREATE OR REPLACE FUNCTION increment_monthly_visits_if_available(
    client_id_input UUID,
    visit_limit_input INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE clients
    SET monthly_visits = COALESCE(monthly_visits, 0) + 1
    WHERE id = client_id_input
      AND COALESCE(monthly_visits, 0) < visit_limit_input;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION increment_click_count(session_id_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE sessions
  SET click_count = COALESCE(click_count, 0) + 1,
      clicked_at = COALESCE(clicked_at, now())
  WHERE id = session_id_input
  RETURNING click_count INTO updated_count;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION replace_routing_rules(client_id_input UUID, rules_input JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE inserted_count INTEGER;
BEGIN
  DELETE FROM routing_rules WHERE client_id = client_id_input;
  INSERT INTO routing_rules (
    client_id, priority, active, signal_type, conditions, action_type,
    action_payload, target_selector, variant_content
  )
  SELECT
    client_id_input, r.priority, COALESCE(r.active, true), r.signal_type,
    COALESCE(r.conditions, '{}'::jsonb), r.action_type,
    COALESCE(r.action_payload, '{}'::jsonb), r.target_selector, r.variant_content
  FROM jsonb_to_recordset(rules_input) AS r(
    priority INTEGER, active BOOLEAN, signal_type TEXT, conditions JSONB,
    action_type TEXT, action_payload JSONB, target_selector TEXT, variant_content TEXT
  );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_click_count(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION replace_routing_rules(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_monthly_visits_if_available(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_click_count(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION replace_routing_rules(UUID, JSONB) TO service_role;

-- ==========================================
-- 4A. PROCESSED WEBHOOKS (IDEMPOTENCY)
-- ==========================================
CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id text PRIMARY KEY,
    processed_at timestamptz DEFAULT now(),
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
    claimed_at timestamptz,
    completed_at timestamptz,
    attempts integer NOT NULL DEFAULT 1,
    last_error text
);

-- ==========================================
-- 4B. LLM LOGS (SERVICE-ROLE ONLY)
-- ==========================================
CREATE TABLE IF NOT EXISTS llm_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
    session_id text,
    deal_id text,
    feature text NOT NULL,
    model_used text NOT NULL,
    prompt_version text DEFAULT 'v1.0',
    system_prompt text,
    input_payload jsonb NOT NULL,
    output_payload jsonb NOT NULL,
    latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    feedback_score integer,
    feedback_type text,
    feedback_edited_output jsonb,
    feedback_at timestamptz,
    feedback_source text
);

CREATE INDEX IF NOT EXISTS idx_llm_logs_client_id ON llm_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_feature ON llm_logs(feature);
CREATE INDEX IF NOT EXISTS idx_llm_logs_created_at ON llm_logs(created_at DESC);
ALTER TABLE llm_logs ENABLE ROW LEVEL SECURITY;

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

-- ROUTING RULES POLICIES
CREATE POLICY "Clients can view their own routing rules" ON routing_rules
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own routing rules" ON routing_rules
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- ANALYTICS EVENTS POLICIES
CREATE POLICY "Clients can view their own analytics events" ON analytics_events
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

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
    delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('processing', 'sent', 'failed')),
    claimed_at timestamptz,
    sent_at timestamptz,
    attempts integer NOT NULL DEFAULT 1,
    last_error text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_digests_client_id ON weekly_digests(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_digests_client_week ON weekly_digests(client_id, week_start);

ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own weekly digests" ON weekly_digests
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own weekly digests" ON weekly_digests
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

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
    rep_name text,
    rep_email text,
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


-- ==========================================
-- 14. DEAL OBITUARIES TABLE
-- ==========================================
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


-- ==========================================
-- 15. ICP PROFILES TABLE
-- ==========================================
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

CREATE POLICY "Clients can view their own icp profiles" ON icp_profiles
    FOR SELECT TO authenticated
    USING (client_id = auth.uid());

CREATE POLICY "Clients can manage their own icp profiles" ON icp_profiles
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());
