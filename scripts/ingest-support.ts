import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { embed } from '../lib/llm/complete'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SUPPORT_DOCS = [
  {
    name: 'what-is-churnaut',
    type: 'overview',
    content: `Churnaut is a B2B RevOps SaaS platform with two core pillars: Website Personalization and Scout AI Deal Intelligence.

PILLAR 1 — WEBSITE PERSONALIZATION
Churnaut lets your sales reps send prospects personalized tracked links. When a prospect clicks the link and lands on your website, Churnaut identifies who they are and dynamically changes the page content in real time — headline, CTA, calendar embed, case study — based on rules you configure. This happens in milliseconds and is completely invisible to the prospect.

PILLAR 2 — SCOUT AI DEAL INTELLIGENCE
Scout AI connects to your HubSpot CRM, pulls your open pipeline deals, and scores them Red, Amber, or Green based on activity, close date, and deal health. It surfaces at-risk deals, suggests next actions, and generates draft outreach emails for your reps.

WHO IS CHURNAUT FOR
B2B SaaS companies with 50-500 employees running cold email or paid ads, using HubSpot, Pipedrive, Zoho, or Close CRM.

PRICING
Starter: $199/month. Growth: $399/month. Pro: $799/month. Annual plans available at 2 months free.

DASHBOARD URL: https://app.churnaut.com
MARKETING SITE: https://churnaut.com`
  },
  {
    name: 'tracked-links',
    type: 'feature',
    content: `TRACKED LINKS — HOW THEY WORK

A tracked link is a unique URL you send to a prospect. When they click it, Churnaut knows exactly who visited your website and can personalize the page for them.

HOW TO CREATE A TRACKED LINK
1. Go to Dashboard → Tracked Links
2. Click "New Link"
3. Fill in prospect details: name, email, company, job title, signal type
4. Click Create — you get a unique URL like yourdomain.com?sid=abc123
5. Copy the link and paste it into your email or LinkedIn message

BULK TRACKED LINKS
You can create hundreds of links at once by uploading a CSV file.
Required CSV columns: prospect_name, prospect_email, company_name, job_title, signal_type
Go to Tracked Links → Upload CSV → download the template if needed

SIGNAL TYPES
Choose the signal type that matches how you're reaching out:
- Cold Email — for email outreach
- LinkedIn Ad — for LinkedIn advertising
- Google Ad — for Google Ads
- Meta Ad — for Facebook/Instagram ads
- TikTok Ad — for TikTok ads
- LinkedIn Lead Gen Form — for LinkedIn lead forms
- G2 Referral — for prospects from G2
- Partner Referral — for partner-referred prospects
- Returning Visitor — for people who visited before

CLICK TRACKING
Every time a prospect clicks your tracked link, Churnaut logs it. You can see click counts on the Tracked Links page. You also get an email notification on the first click.

LINK EXPIRY
Tracked links can be set to expire after a certain date. Expired links return no personalization.

TROUBLESHOOTING
- Link not personalizing? Check that your snippet is installed and your domain is set in Settings
- Not getting click notifications? Make sure your CRM is connected so Churnaut can find the rep email`
  },
  {
    name: 'routing-rules',
    type: 'feature',
    content: `ROUTING RULES — HOW THEY WORK

Routing rules tell Churnaut what to show a prospect when they land on your website. Each rule has: a trigger (signal type), conditions (who the prospect is), and an action (what to change on the page).

HOW TO CREATE A ROUTING RULE
1. Go to Dashboard → Routing Rules
2. Click "New Rule"
3. Choose a Signal Type (e.g. Cold Email)
4. Add Conditions (optional) — e.g. Job title contains "VP" or Company equals "Stripe"
5. Choose an Action — what to change on the page
6. Set the target selector — the CSS selector of the element to change
7. Set the new content — what to replace it with
8. Save and activate the rule

SIGNAL TYPES
Cold Email, LinkedIn Ad, Google Ad, TikTok Ad, Meta Ad, LinkedIn Lead Gen Form, G2 Referral, Partner Referral, Returning Visitor, Any

CONDITIONS
- Any visitor — rule fires for everyone with that signal
- Job title contains — e.g. "VP", "Director", "Manager"
- Company name equals — exact company match
- Deal stage equals — matches CRM deal stage (requires HubSpot)
- UTM campaign contains — matches UTM campaign parameter
- UTM source equals — matches UTM source parameter
- UTM content contains — matches UTM content parameter

ACTIONS
- Show Rep Calendar — embeds a Calendly booking widget on the page
- Show Demo Request Form — shows a short lead capture form
- Change Page Text — rewrites any text on the page
- Show Case Study — injects a case study block
- Send to Different Page — redirects the prospect to another URL

DYNAMIC VARIABLES
Use these in your rule content to personalize with real data:
{{prospect_name}}, {{company_name}}, {{rep_name}}, {{job_title}}, {{deal_stage}}, {{rep_email}}, {{deal_name}}
Example: "Welcome back {{prospect_name}} from {{company_name}}!"

RULE PRIORITY
Rules are evaluated in priority order. Drag to reorder. The first matching rule wins.

MULTIPLE SWAPS
One rule can change multiple elements on the page at once.

PLAYBOOK LIBRARY
21 pre-built rule templates organized in 4 tiers. Go to Routing Rules → Playbook Library tab. Click Install to add any template directly to your rules.

TROUBLESHOOTING
- Rule not triggering? Check the signal type matches your tracked link signal type
- Content not changing? Check your target selector is correct — use browser DevTools to find the right CSS selector
- Variables showing as {{prospect_name}}? Make sure your CRM is connected and the prospect exists in your CRM`
  },
  {
    name: 'snippet-installation',
    type: 'setup',
    content: `SNIPPET INSTALLATION — HOW TO INSTALL CHURNAUT ON YOUR WEBSITE

The Churnaut snippet is a small JavaScript file you add to your website. It enables all personalization features.

HOW TO INSTALL
1. Go to Dashboard → Snippet
2. Copy your installation code
3. Paste it into the <head> section of your website, on every page you want to personalize
4. The snippet is unique to your account — do not share it

INSTALLATION CODE LOOKS LIKE THIS:
<script>window.SR_CLIENT_ID = "your-snippet-key";</script>
<script src="https://app.churnaut.com/snippet.js" async></script>

PLATFORM-SPECIFIC GUIDES
- Webflow: Add to Site Settings → Custom Code → Head Code
- WordPress: Use a plugin like "Insert Headers and Fonters" or add to your theme's header.php
- Framer: Add to Site Settings → Custom Code → Start of <head>
- Shopify: Add to theme.liquid inside the <head> tag
- Next.js / React: Add to your _document.js or layout component

HOW TO TARGET ELEMENTS FOR PERSONALIZATION
Add the class sr-target to any HTML element you want Churnaut to be able to personalize.
Example: <h1 class="sr-target">Your default headline</h1>
This prevents a flash of original content before personalization loads.

CHECKING IF SNIPPET IS WORKING
Go to Dashboard → Snippet → Click "Check Status"
It will show if the snippet has fired in the last 24 hours.

TROUBLESHOOTING
- Snippet not detected? Make sure the script tags are in the <head> and the page has been visited at least once
- Personalization not showing? Check that your domain is set in Settings → Account
- Flash of original content? Add sr-target class to elements you want personalized`
  },
  {
    name: 'crm-integrations',
    type: 'setup',
    content: `CRM INTEGRATIONS — CONNECTING YOUR CRM

Churnaut supports HubSpot, Pipedrive, Zoho CRM, and Close. Connecting your CRM enables live prospect enrichment — when a prospect clicks a tracked link, Churnaut pulls their deal stage, rep owner, and contact data from your CRM automatically.

HOW TO CONNECT HUBSPOT
1. Go to Dashboard → Integrations → CRM → HubSpot
2. Click "Connect HubSpot"
3. You will be redirected to HubSpot to authorize the connection
4. Select your HubSpot account and click Allow
5. You will be redirected back to Churnaut — connection confirmed

HOW TO CONNECT PIPEDRIVE
1. Go to Dashboard → Integrations → CRM → Pipedrive
2. Click "Connect Pipedrive" and follow the OAuth flow

HOW TO CONNECT ZOHO CRM
1. Go to Dashboard → Integrations → CRM → Zoho
2. Click "Connect Zoho" and follow the OAuth flow

HOW TO CONNECT CLOSE
1. Go to Dashboard → Integrations → CRM → Close
2. Click "Connect Close" and follow the OAuth flow

WHAT CRM CONNECTION ENABLES
- Live deal stage data in routing rule conditions
- Dynamic variables like {{deal_stage}} and {{rep_name}} work in rule content
- Scout AI pipeline scoring (HubSpot only currently)
- Rep click notification emails

DISCONNECTING YOUR CRM
Go to Dashboard → Integrations → CRM → your CRM → click Disconnect

TROUBLESHOOTING
- OAuth not completing? Make sure popups are not blocked in your browser
- Deal stage not showing? Check your CRM has open deals with the prospect's email
- HubSpot token expired? Churnaut automatically refreshes HubSpot tokens — reconnect if issues persist`
  },
  {
    name: 'outreach-webhooks',
    type: 'setup',
    content: `OUTREACH TOOL INTEGRATIONS — WEBHOOK SETUP

Churnaut integrates with Instantly, Smartlead, Apollo, Lemlist, Zapier, and Make via webhooks. This enables the magic flow: every prospect added to a sequence automatically gets a unique personalized tracked link inserted into their email.

HOW THE MAGIC FLOW WORKS
1. You set up the webhook in your outreach tool once
2. When a prospect is added to a sequence, the tool fires a webhook to Churnaut
3. Churnaut creates a tracked session and returns a unique {{churnaut_link}}
4. Your outreach tool inserts {{churnaut_link}} into the email template automatically
5. Every prospect gets their own personalized link — zero manual work

HOW TO GET YOUR WEBHOOK URL
Go to Dashboard → Integrations → Outreach Tools
Your webhook URL is: https://app.churnaut.com/api/webhook?client_key=YOUR_KEY
Copy it from the dashboard — it shows your actual key automatically

SETTING UP IN INSTANTLY
1. In Instantly, go to your campaign settings
2. Find the Webhook section
3. Paste your Churnaut webhook URL
4. Add {{churnaut_link}} to your email template where you want the link to appear
5. Test with a sample prospect

SETTING UP IN SMARTLEAD
Same process — paste webhook URL in campaign webhook settings, use {{churnaut_link}} in email template

SETTING UP IN APOLLO
Go to Apollo → Sequences → Settings → Webhook → paste your Churnaut webhook URL

SETTING UP IN LEMLIST
Go to campaign settings → Integrations → Webhook → paste URL

SETTING UP IN ZAPIER OR MAKE
Use Churnaut webhook URL as the POST endpoint in your Zap or scenario

IMPORTANT: Set your domain in Settings → Account before using webhooks. Without a domain, the churnaut_link will not be generated correctly.

TROUBLESHOOTING
- Not getting churnaut_link back? Check your domain is set in Settings
- Webhook not firing? Check the URL is correct and includes your client_key
- Wrong prospect data? Check your field mappings in Integrations → Outreach Tools → Field Mappings`
  },
  {
    name: 'scout-ai',
    type: 'feature',
    content: `SCOUT AI — PIPELINE INTELLIGENCE

Scout AI connects to your HubSpot CRM and gives you an AI-powered view of your entire pipeline. It scores every deal Red, Amber, or Green and tells your reps exactly what to do next.

REQUIREMENTS
Scout AI currently requires HubSpot to be connected. Go to Integrations → CRM → HubSpot to connect first.

DEAL SCORES
- RED (At Risk) — deal needs immediate attention. No activity in 10+ days with close date within 30 days, or single contact on a high-value deal, or stuck too long in one stage
- AMBER (Warning) — deal needs monitoring. No activity in 5-10 days or close date within 45 days
- GREEN (Healthy) — deal is on track. Recent activity, multiple contacts engaged

HOW TO RUN SCOUT ANALYSIS
1. Go to Dashboard → Scout
2. Click "Run Scout Analysis"
3. Scout pulls your open deals from HubSpot and scores them — takes 30-60 seconds
4. Results show in Pipeline Health section organized by Red, Amber, Green

SCOUT INBOX
The Scout Inbox at the top of the Scout page shows your daily brief — the most urgent deals and actions for today.

PIPELINE OVERVIEW
Shows your overall pipeline pressure score (0-100). 0-30 is Healthy, 31-60 is Needs Attention, 61-100 is At Risk.

DEAL CARDS
Each deal card shows: deal name, stage, score, primary risk, suggested next action, and a draft outreach email for Red deals. Click "Nudge Rep" to alert the rep directly.

DEAL ACCELERATION TRIGGERS
Shows prospects with open deals who visited your website in the last 24 hours — the perfect time to reach out.

REP INTELLIGENCE
Shows blind spots across your team — reps with no multi-threading, consistent inactivity, or deals stuck in one stage.

DEAL OBITUARIES
Auto-generated post-mortems for closed-lost deals — explains what likely went wrong and what could have been done differently.

ICP BUILDER
Analyzes your closed-won deals to build your Ideal Customer Profile — top job titles, average deal value, average days to close.

TROUBLESHOOTING
- No deals showing? Make sure HubSpot is connected and has open deals
- Scores seem wrong? Scout uses activity data from HubSpot — make sure your team is logging activity
- Scout not running? Refresh the page and try again`
  },
  {
    name: 'analytics',
    type: 'feature',
    content: `ANALYTICS — UNDERSTANDING YOUR DATA

The Analytics page shows you how your personalization is performing across all prospects, rules, and reps.

WHAT YOU CAN SEE
- Total sessions — number of tracked links created
- Total clicks — number of times prospects clicked tracked links
- Rules triggered — how many times personalization fired
- Conversions — prospects who converted after clicking
- Line chart — clicks and rule triggers over time
- Bar chart — performance by signal type
- Rule performance table — which rules are triggering most
- Rep performance table — which reps are sending the most tracked links
- Recent activity log — live feed of all events

HOW TO USE IT
Go to Dashboard → Analytics
Use the date range selector to filter by time period
Click on any rule in the Rule Performance table to see its details

UNDERSTANDING SIGNAL TYPES IN ANALYTICS
Each bar in the signal type chart shows how many events came from that source — cold email, LinkedIn ads, Google ads, etc.`
  },
  {
    name: 'calendly-integration',
    type: 'setup',
    content: `CALENDLY INTEGRATION

Connect Calendly to embed booking widgets directly on your website when prospects click tracked links. This enables the "Show Rep Calendar" action in routing rules.

HOW TO CONNECT CALENDLY
1. Go to Dashboard → Integrations → Calendly
2. Click "Connect Calendly"
3. Authorize Churnaut to access your Calendly account
4. Your calendar is now available in routing rules

USING CALENDLY IN ROUTING RULES
1. Create or edit a routing rule
2. Choose Action: Show Rep Calendar
3. The prospect will see a Calendly booking widget embedded on the page when they visit

This is the highest-converting action in Churnaut — showing a rep's calendar directly to a warm prospect dramatically increases booking rates.`
  },
  {
    name: 'troubleshooting-common-issues',
    type: 'troubleshooting',
    content: `TROUBLESHOOTING — COMMON ISSUES

PERSONALIZATION NOT SHOWING
1. Check snippet is installed — go to Dashboard → Snippet → Check Status
2. Check your domain is set — go to Settings → Account → Website Domain
3. Check the tracked link has the correct signal type matching your routing rule
4. Check the routing rule is active (green toggle)
5. Check the target selector matches an element that exists on your page

TRACKED LINK NOT WORKING
1. Make sure the link includes ?sid= parameter
2. Check the link has not expired
3. Try opening the link in an incognito window

WEBHOOK NOT RETURNING CHURNAUT_LINK
1. Check your domain is set in Settings → Account
2. Check the webhook URL includes your correct client_key
3. Check the payload includes at least an email or name field

CRM NOT CONNECTING
1. Make sure you are logged into your CRM in the same browser
2. Disable popup blockers temporarily
3. Try disconnecting and reconnecting

SCOUT AI NOT SHOWING DEALS
1. Confirm HubSpot is connected under Integrations → CRM → HubSpot
2. Make sure HubSpot has open deals (not closed-won or closed-lost)
3. Click Run Scout Analysis to refresh

VARIABLES SHOWING AS {{prospect_name}} IN PERSONALIZATION
1. Make sure your CRM is connected
2. Make sure the prospect exists in your CRM with the same email used in the tracked link
3. HubSpot enrichment is currently the most reliable — connect HubSpot for best results

GETTING SUPPORT
If you cannot resolve an issue, contact support at support@churnaut.com`
  },
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
  return embed(text)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function ingestSupport() {
  console.log('Starting Churnaut support knowledge ingestion...')

  const { error: clearError } = await supabase
    .from('support_embeddings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (clearError) { console.error('Failed to clear:', clearError); process.exit(1) }
  console.log('Cleared existing support embeddings.\n')

  let totalChunks = 0

  for (const doc of SUPPORT_DOCS) {
    const chunks = chunkContent(doc.content)
    console.log(`  Indexing: ${doc.name} (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`)
    for (let i = 0; i < chunks.length; i++) {
      const contextualChunk = `Document: ${doc.name}\nType: ${doc.type}\n\n${chunks[i]}`
      try {
        const embedding = await embedText(contextualChunk)
        const { error } = await supabase.from('support_embeddings').insert({
          doc_name: doc.name,
          doc_type: doc.type,
          chunk_index: i,
          content: contextualChunk,
          token_count: Math.ceil(contextualChunk.length / 4),
          embedding: JSON.stringify(embedding),
          last_indexed_at: new Date().toISOString(),
        })
        if (error) console.error(`    ERROR inserting chunk ${i}:`, error.message)
        else totalChunks++
        await sleep(200)
      } catch (err) {
        console.error(`    ERROR embedding chunk ${i}:`, err)
      }
    }
  }

  console.log(`\nSupport ingestion complete. Total chunks: ${totalChunks}`)
}

ingestSupport().catch(console.error)
