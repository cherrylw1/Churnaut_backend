import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONTEXT_DOCS = [
  {
    name: 'product-overview-and-vision',
    type: 'context',
    content: `CHURNAUT — PRODUCT OVERVIEW & VISION

One-Line Pitch: Turn every link you send into a personalized landing experience. Your CRM knows who they are. Your website should too.

Category: B2B RevOps SaaS — Deterministic Signal-Based Website Personalization + AI Pipeline Intelligence

Pricing: $199 (Starter) / $399 (Growth) / $799 (Pro) per month. Yearly = 10 months price, 2 months free.

Target ICP: B2B SaaS companies, 50-500 employees, using HubSpot or Zoho, running cold email or paid ads.

Live URLs:
- App: https://app.churnaut.com
- Marketing site: https://churnaut.com
- GitHub: github.com/cherrylw1 (private)

Founder: Sharath — solo founder, based in Bengaluru, India. B2B SaaS sales professional, 5+ years experience. Currently also works at Gnani.ai as Sales Representative (US market). Also runs Cherry On Top (paid media agency for SMBs). B.Sc. Computer Science, Davanagere University.

Company: Churnaut Technologies Private Limited — Karnataka-incorporated B2B SaaS.`
  },
  {
    name: 'two-pillars-core-product',
    type: 'context',
    content: `CHURNAUT — TWO CORE PILLARS

PILLAR 1 — WEBSITE PERSONALIZATION ENGINE
The core product. When a rep sends a prospect a tracked link and the prospect clicks it, Churnaut identifies who they are and dynamically personalizes the page content in real time.

How it works step by step:
1. Rep creates a tracked link for a prospect (name, email, company, job title, signal type)
2. Prospect clicks the link, lands on the client's website
3. Churnaut's edge snippet fires, calls the resolve API with the session ID
4. Routing rules are evaluated against the session context
5. Matching rule applies content swaps to the page (headline, CTA, calendar embed, etc.)
6. All personalization happens in milliseconds, invisible to the prospect

Signal types supported: Cold Email, LinkedIn Ad, Google Ad, TikTok Ad, Meta Ad, LinkedIn Lead Gen Form, G2 Referral, Partner Referral, Returning Visitor, Any

Action types: Show Rep Calendar (Calendly embed), Show Demo Request Form, Change Page Text, Show Case Study, Send to Different Page

Variable interpolation in rules: {{prospect_name}}, {{company_name}}, {{rep_name}}, {{job_title}}, {{deal_stage}}, {{rep_email}}, {{deal_name}}

The Magic Outreach Flow (zero manual work):
1. Client sets up webhook in Instantly/Smartlead/Apollo once
2. Prospect added to sequence → platform fires webhook to Churnaut
3. Churnaut creates session, returns {{churnaut_link}}
4. Platform inserts link into email template automatically
5. Every prospect gets unique personalized tracked link — zero manual work per rep

PILLAR 2 — SCOUT AI DEAL INTELLIGENCE
Connects to HubSpot CRM via OAuth. Pulls open pipeline deals. Scores them using Gemini AI into Red/Amber/Green health ratings. Surfaces at-risk deals, suggests next actions, generates draft outreach emails. Weekly pipeline digest emails sent to reps via Resend.

Scout scoring rules:
- RED = no activity 10+ days + close within 30 days OR single contact on $10K+ deal OR stuck 2x average stage duration
- AMBER = no activity 5-10 days OR close date within 45 days
- GREEN = activity within 5 days, multiple contacts
- NULL activity treated as 999 days inactive

Scout AI model: Gemini 2.5 Flash-Lite with 3-layer prompt (Scout persona + scoring rules + deal data + Deal DNA injection if available)`
  },
  {
    name: 'tech-stack-and-infrastructure',
    type: 'context',
    content: `CHURNAUT — TECH STACK & INFRASTRUCTURE

Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS
Backend: Next.js API Routes (serverless)
Database: Supabase (PostgreSQL) — all RLS enabled, all API routes use supabaseAdmin (service role key)
Cache: Upstash Redis — rate limiting + caching (300s TTL for resolve, 60s for pipeline)
CDN/Hosting: Vercel — auto-deploys from GitHub main branch
AI (Product): Google Gemini 2.5 Flash-Lite
AI (Embeddings): Google gemini-embedding-001 (768 dimensions, outputDimensionality: 768)
AI (Codebase Chat): Qwen/Qwen2.5-7B-Instruct-Turbo via Together AI
Email: Resend — sent from noreply@churnaut.com
Payments: Lemon Squeezy (pending — blocked on Pvt Ltd registration)
Ad Tracking: Google (gclid), LinkedIn (li_fat_id), Meta (fbclid), TikTok (ttclid), UTMs
OAuth CRMs: HubSpot (live + enrichment), Pipedrive (live), Zoho (live), Close (live)
Outreach Webhooks: Instantly, Smartlead, Apollo, Lemlist, Zapier, Make
Calendar: Calendly (OAuth)
IDE: Antigravity (auto-deploys to Vercel on push to main)

Design System:
- Font: font-mono for all UI text, font-sans for headings
- Accent: #6366f1 (indigo), #10b981 (green success)
- CSS vars: var(--border-subtle), var(--bg-elevated), var(--bg-surface), var(--text-primary), var(--text-secondary), var(--text-muted)
- Dark theme throughout — background ~#080B0F to #111118
- Primary button: bg-[#6366f1] hover:bg-[#5053e1]
- All labels: uppercase tracking-wider font-mono text-xs
- Status badges: green pulsing dot (active/connected), gray (disconnected/coming soon), yellow (pending)

Environment Variables:
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
GEMINI_API_KEY, GEMINI_EMBEDDING_KEY, TOGETHER_API_KEY
HUBSPOT_CLIENT_ID/SECRET, PIPEDRIVE_CLIENT_ID/SECRET, ZOHO_CLIENT_ID/SECRET
CLOSE_CLIENT_ID/SECRET, CALENDLY_CLIENT_ID/SECRET, CALENDLY_WEBHOOK_SIGNING_KEY
RESEND_API_KEY, NEXT_PUBLIC_SNIPPET_CDN_URL`
  },
  {
    name: 'database-schema',
    type: 'context',
    content: `CHURNAUT — DATABASE SCHEMA (ALL TABLES)

clients — Master account table
Key columns: id (uuid), company_name, domain (used to build trackedUrl), plan, snippet_key (auth token + webhook URL key), crm_type, crm_api_key (encrypted tokens JSON), calendly_token, stripe_customer_id, active

sessions — Every tracked link ever created
Key fields: id (6-char session ID), client_id, prospect_name, prospect_email, company_name, job_title, signal_type, assigned_rep, calendar_url, visitor_token, click_count, converted, converted_at, expires_at, deal_stage, crm_deal_id, metadata (jsonb)

routing_rules — Personalization rules
Key fields: id, client_id, signal_type, conditions (jsonb), action_type, action_payload (jsonb), target_selector, variant_content, priority, active

crm_tokens — Encrypted OAuth tokens per CRM
Key fields: id, client_id, crm_type, access_token (encrypted), refresh_token (encrypted), expires_at, updated_at

analytics_events — Event log
Key fields: id, client_id, session_id, rule_id, event_type (rule_triggered/no_match/webhook), signal_type, created_at, metadata (jsonb)

webhook_mappings — Field mapping config for universal webhook
Key fields: client_id, external_field, internal_field

playbook_templates — 21 pre-built rule templates
Key fields: id, name, description, signal_type, tier (1-4), required_inputs (jsonb), rule_template (jsonb)

deal_scores — Scout AI pipeline scoring
Key fields: client_id, deal_id, deal_name, stage, score (RED/AMBER/GREEN), primary_risk, next_action, draft_email, scored_at

pipeline_snapshots — Daily pipeline state
Key fields: client_id, total_deals, red_count, amber_count, green_count, pressure_score

scout_nudges — One-click rep nudges
Key fields: client_id, deal_id, rep_email, message, sent

company_deal_patterns — Deal DNA fingerprinting
Key fields: client_id, avg_deal_cycle_days, avg_stage_duration (jsonb), single_contact_close_rate, top_close_signals (jsonb), calculated_at

deal_obituaries — Post-mortems for closed-lost deals
Key fields: client_id, deal_id, deal_name, deal_value, stage_died_in, likely_cause, what_rep_could_do, pattern_match, full_obituary

icp_profiles — ICP from closed-won deals
Key fields: client_id, top_job_titles (jsonb), avg_deal_value, avg_days_to_close, win_count, icp_summary, generated_at

anomaly_alerts — Scout + routing anomaly alerts
Key fields: client_id, alert_text, severity, read

weekly_digests — AI weekly digest
Key fields: client_id, week_start, summary, top_signal, rep_spotlight, recommendation

llm_logs — Every LLM inference call (for fine-tuning dataset)
Key fields: id (uuid), created_at, client_id, feature (scout_score/copywriter/weekly_digest), model_used, prompt_version, system_prompt, input_payload (jsonb), output_payload (jsonb), latency_ms, input_tokens, output_tokens, feedback_score, feedback_type (accepted/rejected), feedback_edited_output, feedback_source (explicit_rating/rep_action/inferred/synthetic)

code_embeddings — RAG vector store for codebase chat
Key fields: id (uuid), file_path, file_type, chunk_index, content (text), token_count, embedding (vector 768), last_indexed_at
Indexed with HNSW cosine index. match_code_chunks() RPC function for similarity search.`
  },
  {
    name: 'integrations-and-crm',
    type: 'context',
    content: `CHURNAUT — INTEGRATIONS

CRM INTEGRATIONS (OAuth-based)
All use same pattern: OAuth authorize → callback → encrypt tokens → store in crm_tokens + clients.crm_type

HubSpot — LIVE. Full token refresh logic. Live enrichment during resolve. Scout AI pipeline fetching.
- OAuth: /api/oauth/hubspot + callback
- Token refresh: checks expiry within 5 min, refreshes via POST to HubSpot token endpoint
- Live enrichment: enrichSessionFromHubSpot — pulls contact, deal stage, rep owner, 5-min Redis cache
- Pipeline fetching: fetchHubSpotPipeline — uses Search API with NEQ filters to exclude closedwon/closedlost

Pipedrive — LIVE. Tokens stored. Enrichment not yet built.
Zoho — LIVE. Tokens stored. Enrichment not yet built.
Close — LIVE (special). No state param. No redirect_uri in authorize. Client identified from session cookie in callback. Basic auth header. Token URL: https://api.close.com/oauth2/token/
Salesforce — Coming Soon. Needs Connected App registration.
Attio — Coming Soon. Needs OAuth app registration.

OUTREACH TOOLS (Webhook-based)
Universal endpoint: https://app.churnaut.com/api/webhook?client_key={snippet_key}
All active: Instantly, Smartlead, Apollo, Lemlist, Zapier, Make

CALENDLY — LIVE OAuth. Embeds calendar in personalization rules.

KNOWN ISSUES:
- rep_email for click notifications only fires if HubSpot connected and prospect in HubSpot
- Token refresh for Pipedrive/Zoho/Close not needed yet (no API calls made)
- HubSpot enrichment only — variable interpolation works fully only for HubSpot accounts
- client.domain required for webhook trackedUrl — if not set, churnaut_link is malformed`
  },
  {
    name: 'ai-ml-roadmap',
    type: 'context',
    content: `CHURNAUT — AI/ML ROADMAP & CURRENT STATE

CURRENT AI FEATURES:
- Scout AI deal scoring: Gemini 2.5 Flash-Lite, Red/Amber/Green ratings, all calls logged to llm_logs
- AI Copywriter: Gemini-powered, 5 CTA variants per rule, 30-day Redis cache, logged to llm_logs
- Weekly Digest: Gemini generates 4-section plain-English pipeline summary, logged to llm_logs
- Codebase RAG Chat: pgvector + Qwen2.5-7B via Together AI at /dashboard/chat

PHASE 1 — LLM LOGGING (COMPLETE)
llm_logs table captures every inference call. logLLMCall() utility in lib/llm/logger.ts (fire-and-forget). logLLMCallWithId() returns row UUID for feedback linking. Wired into scout/score, ai/copywriter, ai/digest routes.

PHASE 2 — FEEDBACK COLLECTION (COMPLETE)
Thumbs up/down on RED and AMBER Scout deal cards. log_id returned in Scout score API response. /api/scout/feedback PATCH endpoint writes feedback_type back to llm_logs. feedbackGiven state prevents double-submission.

PHASE 3 — CODEBASE RAG CHAT (COMPLETE)
pgvector enabled on Supabase. code_embeddings table with HNSW index (768 dimensions). match_code_chunks() RPC for cosine similarity search. scripts/ingest.ts walks repo, chunks files, embeds via gemini-embedding-001, stores in Supabase. /api/chat/codebase route: embeds query, vector search top 8 chunks, passes to Qwen2.5-7B. /dashboard/chat: clean chat UI, suggested questions, sources shown.

PHASE 4 — FINE-TUNING PLAN (FUTURE)
Target model: Gemma 3 4B (or Qwen2.5-7B when data is ready)
Training platform: Together AI (LoRA SFT)
Timeline: 6-12 months — wait for sufficient llm_logs data + feedback signals
Milestone for first run: 500 rows with ~30-40% feedback coverage
Synthetic data generation can bootstrap dataset before real user volume
Together AI account created: TOGETHER_API_KEY in .env.local, $25 free credits`
  },
  {
    name: 'working-patterns-and-rules',
    type: 'context',
    content: `CHURNAUT — HOW CLAUDE AND SHARATH WORK TOGETHER

WORKFLOW:
1. Recon first — always ask Antigravity to show current file contents before writing any build prompt (prefix with "Do not change anything.")
2. Paste recon here — Sharath pastes Antigravity's response into Claude
3. Claude writes precise prompt — targeting exact file names, component names, line-level changes
4. Sharath copies and fires — into Antigravity
5. Sharath confirms completion — pastes Antigravity's summary back

PROMPT FORMAT RULES:
- Simple recon prompts: inline text, no card widget, prefix with "Do not change anything."
- Build prompts: card widget with copy button, muted body text color
- Always include VERIFY AND DEPLOY step (npm run build + push to main)
- For env variable additions: give exact lines to add to .env.local

ANTIGRAVITY BEHAVIOR:
- Antigravity is the AI coding tool connected to the actual codebase
- It can read files, make changes, run builds, push to git
- Always deployed to Vercel on push to main — no manual deploy needed

CRITICAL BUGS FIXED — DO NOT REINTRODUCE:
- snippet.js calls app.churnaut.com/api/resolve NOT any other URL
- /api/resolve looks up client by snippet_key not id
- sid is nested inside signals object: const sid = signals?.sid
- signal_type matching uses normalize() — lowercase + replace spaces with underscores
- Redis cache was serving stale empty swaps — bypassCache=true on POST scout/score
- /api/webhook client lookup uses .eq('snippet_key', key) NOT .or() query
- HubSpot access tokens expire after 30 min — auto refresh logic in both hubspot-pipeline.ts and hubspot.ts
- sessions.metadata column doesn't exist — use prospect_name/prospect_email/signal_type/visitor_type/deal_stage
- duplicate crm_tokens rows — orders by updated_at and takes tokens[0]
- HubSpot pipeline returns closedwon/closedlost — now uses Search API with NEQ filters
- stale deal_scores not cleaned up — cleanup step in score POST deletes rows where deal_id NOT IN current open deals`
  },
  {
    name: 'product-roadmap-and-pending',
    type: 'context',
    content: `CHURNAUT — PRODUCT ROADMAP & PENDING FEATURES

BLOCKED (waiting on Pvt Ltd registration):
- Lemon Squeezy billing + feature gating
- Pricing: Starter $199/mo, Growth $399/mo, Pro $799/mo (yearly = 10 months price)

PENDING INTEGRATIONS:
- Salesforce OAuth — needs Connected App in Salesforce org
- Attio OAuth — needs OAuth app registration
- Pipedrive/Zoho/Close live enrichment — tokens stored, API calls not built yet

PENDING AI FEATURES:
- Routing Suggestions Engine — needs 30 days real conversion data
- Scout Memory / Company Profile — living document of what Scout learned
- Buyer Silence Detection
- Auto-Personalized Page Generator — for LinkedIn Lead Gen + QR code signals
- Gemma fine-tuning — wait for 500+ llm_logs rows with feedback

NEXT BUILD PRIORITIES (as of June 2026):
1. Synthetic training data pipeline (scripts/generate-synthetic.ts)
2. Training data export (scripts/export-training-data.ts)
3. Pipedrive/Zoho/Close enrichment
4. Salesforce OAuth

MARKETING SITE (churnaut.com):
Needs full redesign — old branding and copy still in place. Separate Vercel project (signal-route).

NON-DILUTIVE CAPITAL STRATEGY:
Churnaut has a full 24-month non-dilutive capital roadmap. Key opportunities:
- File LUT (Letter of Undertaking) with GST — zero-rates all export invoices, saves 18% GST on all foreign revenue
- DPIIT Startup India Recognition — foundational for 80-IAC tax holiday, angel tax exemption, ESOP flexibility
- Section 80-IAC Tax Holiday — 100% profit deduction for 3 consecutive years out of first 10
- Karnataka Elevate Programme — ₹25L non-repayable grant (25-35% approval probability)
- Google for Startups Cloud Program — up to $200K in Google Cloud + Gemini API credits
- AWS Activate — up to $100K in AWS credits
- SEIS (Service Exports from India Scheme) — 3% duty credit scrips on net foreign exchange earnings
- STPI Registration — software exporter status, duty exemptions
- MeitY Startup Hub — ₹25L-₹2Cr grants for AI/SaaS companies
- Total 24-month non-dilutive opportunity: ₹42.5L (conservative) to ₹2.6Cr+ (optimistic)`
  },
  {
    name: 'feature-status-complete',
    type: 'context',
    content: `CHURNAUT — COMPLETE FEATURE STATUS (June 2026)

LIVE AND WORKING:
- Snippet & personalization engine — full resolve flow, timeout fix, session expiry
- Tracked Links — single, bulk CSV, click counting, rep click notifications
- Routing Rules — CRUD, drag reorder, priority, active toggle
- AI Copywriter — Gemini-powered, logged to llm_logs
- Playbook Library — 21 templates, 4 tiers, install flow (tab inside Routing Rules)
- Analytics — stats, charts, rule performance, rep performance
- HubSpot OAuth + live enrichment + token refresh
- Pipedrive OAuth — tokens stored
- Zoho OAuth — tokens stored
- Close OAuth — special: no state param, Basic auth
- Calendly OAuth
- Outreach webhooks — Instantly, Smartlead, Apollo, Lemlist, Zapier, Make
- Scout AI — pipeline scoring, Red/Amber/Green, Deal Acceleration Triggers, Rep Blind Spots, Deal Obituaries
- Scout Feedback — thumbs up/down on RED/AMBER cards, writes to llm_logs
- ICP Builder — from closed-won HubSpot deals
- Onboarding flow — 4-step checklist, auto-dismiss
- LLM Logging — all 3 AI routes wired to llm_logs
- Codebase RAG Chat — /dashboard/chat, pgvector + Qwen2.5-7B

BLOCKED:
- Salesforce OAuth — needs Connected App
- Attio OAuth — needs app registration
- Lemon Squeezy billing — blocked on Pvt Ltd registration
- Pipedrive/Zoho/Close enrichment — tokens stored, not built
- Gemma fine-tuning — waiting for data

TEST ACCOUNT:
- Company: signal / domain: signal.com
- snippet_key: 9b6d3521-e9c0-4ff9-8aa5-7f84dd53788f
- client_id: c8aa7742-287a-40ea-9d5c-064b51a58d9c
- Test page: https://app.churnaut.com/test.html`
  }
]

function chunkContent(content: string): string[] {
  const CHUNK_SIZE = 1500
  const OVERLAP = 200
  if (content.length <= 2000) return [content]
  const chunks: string[] = []
  let start = 0
  while (start < content.length) {
    const end = Math.min(start + CHUNK_SIZE, content.length)
    chunks.push(content.slice(start, end))
    start += CHUNK_SIZE - OVERLAP
  }
  return chunks
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_EMBEDDING_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768 }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.embedding.values
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function ingestContext() {
  console.log('Starting Churnaut context document ingestion...')
  console.log(`Target: ${CONTEXT_DOCS.length} documents\n`)

  // Delete only context type rows — keeps code embeddings intact
  const { error: clearError } = await supabase
    .from('code_embeddings')
    .delete()
    .eq('file_type', 'context')

  if (clearError) {
    console.error('Failed to clear existing context embeddings:', clearError)
    process.exit(1)
  }
  console.log('Cleared existing context embeddings.\n')

  let totalChunks = 0

  for (const doc of CONTEXT_DOCS) {
    const chunks = chunkContent(doc.content)
    console.log(`  Indexing: ${doc.name} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`)

    for (let i = 0; i < chunks.length; i++) {
      const contextualChunk = `Document: ${doc.name}\nType: context\n\n${chunks[i]}`
      try {
        const embedding = await embedText(contextualChunk)
        const { error } = await supabase.from('code_embeddings').insert({
          file_path: `context/${doc.name}`,
          file_type: 'context',
          chunk_index: i,
          content: contextualChunk,
          token_count: Math.ceil(contextualChunk.length / 4),
          embedding: JSON.stringify(embedding),
          last_indexed_at: new Date().toISOString(),
        })
        if (error) {
          console.error(`    ERROR inserting chunk ${i}:`, error.message)
        } else {
          totalChunks++
        }
        await sleep(200)
      } catch (err) {
        console.error(`    ERROR embedding chunk ${i}:`, err)
      }
    }
  }

  console.log(`\nContext ingestion complete.`)
  console.log(`Total context chunks indexed: ${totalChunks}`)
}

ingestContext().catch(console.error)