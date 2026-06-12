import { supabaseAdmin } from '@/lib/supabase'

// ─── compact deal type ───────────────────────────────────────────────────────
type DemoDeal = {
  id: string; name: string; company: string; owner: string; ownerEmail: string;
  stage: string; score: 'RED' | 'AMBER' | 'GREEN'; confidence: 'low' | 'medium' | 'high';
  value: number; closeDate: string; daysInactive: number; contacts: number;
  risk: string; action: string; reasoning: string; evidence: string[];
  draftEmail?: string;
}

// ─── 32 open deals (9 RED / 5 AMBER / 18 GREEN) ──────────────────────────────
const DEMO_DEALS: DemoDeal[] = [
  // ── RED ──────────────────────────────────────────────────────────────────
  {
    id: 'demo_betterworks', name: 'Betterworks - Growth Annual', company: 'Betterworks',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'RED', confidence: 'high',
    value: 16800, closeDate: '2026-07-02', daysInactive: 35, contacts: 1,
    risk: 'Champion went dark 35 days after buy-in. Single-threaded $17K deal with close date 23 days out.',
    action: 'Send a pattern interrupt — reference something specific from the CRO conversation. Loop in a second contact above or beside Monica Tan immediately.',
    reasoning: 'Champion bought in but has not responded in 35 days. Single contact + close date imminent = critical churn risk.',
    evidence: ['35 days since last activity — longest silence on any open deal', 'Single contact (Monica Tan, CRO) with no backup contact', 'Close date July 2 — 23 days away', 'No stage progression in 6 weeks'],
    draftEmail: 'Hi Monica,\n\nI noticed we haven\'t connected since our last call — wanted to check in before your Q3 planning locks in.\n\nWe\'re seeing teams like yours use Churnaut to cut personalization setup from weeks to hours. Given what you shared about your outbound stack, the ROI case is strong.\n\nAre you still the right person to move this forward, or has this shifted to someone else on the team?\n\nBest,\nSharath',
  },
  {
    id: 'demo_waydev', name: 'Waydev - Starter Annual', company: 'Waydev',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'RED', confidence: 'high',
    value: 4800, closeDate: '2026-07-05', daysInactive: 39, contacts: 1,
    risk: 'Intro call held 39 days ago with zero follow-up. Completely stale with close date 26 days out.',
    action: 'Send a breakup email. Either re-engage with urgency or free up the pipeline slot.',
    reasoning: 'Longest-inactive deal in pipeline at 39 days. No follow-up after intro call is a fatal signal.',
    evidence: ['39 days since last contact — most stale deal in pipeline', 'No follow-up email sent after intro call', 'Close date July 5 — 26 days away', 'Single contact (Adam Kovacs, Head of Marketing)'],
    draftEmail: 'Hi Adam,\n\nIt\'s been a few weeks since our intro call and I haven\'t heard back. Totally understand priorities shift.\n\nI\'ll take your silence as a signal this isn\'t the right time — but if anything has changed and you\'d like to revisit, I\'m one email away.\n\nSharath',
  },
  {
    id: 'demo_jellyfish', name: 'Jellyfish - Starter Annual', company: 'Jellyfish',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'RED', confidence: 'high',
    value: 4800, closeDate: '2026-07-02', daysInactive: 32, contacts: 1,
    risk: 'Budget confirmed but champion not responsive for 32 days. Close date 23 days out — high churn risk.',
    action: 'Try a channel switch — reach Sophie on LinkedIn with a specific value hook, not a check-in.',
    reasoning: 'Champion confirmed budget then went silent. 32-day gap at Qualified stage with imminent close date.',
    evidence: ['32 days since last activity — budget was confirmed before silence', 'Close date July 2 is 23 days away', 'Single contact (Sophie Andersen, Marketing Ops)', 'No stage movement since qualification'],
    draftEmail: 'Hi Sophie,\n\nQuick note — you confirmed budget a month ago and I\'ve been trying to connect. Wanted to make sure nothing fell through on our end.\n\nIf the timing shifted internally, just say the word. Otherwise, I have a 20-min slot Thursday that works well for a quick next step.\n\nSharath',
  },
  {
    id: 'demo_crossbeam', name: 'Crossbeam - Growth Annual', company: 'Crossbeam',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'RED', confidence: 'high',
    value: 16800, closeDate: '2026-07-05', daysInactive: 30, contacts: 1,
    risk: '$17K deal. Decision maker bought in then went dark at 30 days. Completely single-threaded.',
    action: 'Find a second contact at Crossbeam — use LinkedIn to identify Ryan Castillo\'s manager or a peer who influences vendor decisions.',
    reasoning: 'High-value deal at advanced stage with 30-day silence. Single-threading is the exact pattern that killed Outreach.io ($48K lost).',
    evidence: ['30 days since last activity after decision maker confirmed', 'Single contact (Ryan Castillo, Head of Revenue) — no multi-threading', '$16,800 deal value at risk', 'Matches loss pattern: single-threaded deals at this stage have 0% close rate in history'],
  },
  {
    id: 'demo_bombora', name: 'Bombora - Growth Annual', company: 'Bombora',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'RED', confidence: 'high',
    value: 28800, closeDate: '2026-07-09', daysInactive: 23, contacts: 1,
    risk: '$29K deal. CMO attended demo 23 days ago. Zero response to 3 follow-ups. Close date 30 days out.',
    action: 'Escalate to Bombora\'s VP Sales or find a second contact who attended the demo internally. CMO engagement without follow-up means internal blocker.',
    reasoning: 'C-level demo attendance followed by complete silence after 3 outreach attempts is a strong signal of an internal blocker, not disinterest.',
    evidence: ['CMO (Justin Lee) attended live demo 23 days ago', '3 follow-up attempts with zero response', 'Close date July 9 — 30 days away', '$28,800 at risk — second-highest RED deal by value'],
  },
  {
    id: 'demo_groove', name: 'Groove - Growth Annual', company: 'Groove',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'RED', confidence: 'medium',
    value: 14400, closeDate: '2026-07-06', daysInactive: 26, contacts: 1,
    risk: 'Went quiet after second call at Qualified stage. 26-day silence, 27-day close window, single contact.',
    action: 'Send a specific ROI summary referencing what Patrick Morgan shared on the second call. Make the next step concrete — offer a pricing walkthrough with a fixed date.',
    reasoning: 'Two calls completed then silence. Pattern matches deals where pricing or internal buy-in stalled after qualification.',
    evidence: ['26 days since last activity after 2nd call', 'Single contact (Patrick Morgan, Head of Marketing)', 'Close date July 6 — 27 days away', 'No stage progression since qualification'],
    draftEmail: 'Hi Patrick,\n\nWanted to share a quick ROI snapshot based on what you told me on our last call.\n\nAt your current outreach volume, Churnaut typically pays back within 6 weeks. Happy to walk through the numbers together — does Thursday at 2pm PT work?\n\nSharath',
  },
  {
    id: 'demo_clari', name: 'Clari - Pro Annual', company: 'Clari',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'RED', confidence: 'high',
    value: 33600, closeDate: '2026-06-30', daysInactive: 22, contacts: 1,
    risk: '$34K deal closing in 18 days. CRO attended demo but has not responded in 22 days. Single contact at C-level.',
    action: 'Contact Clari\'s VP Sales or RevOps as a secondary thread today. CRO silence at this stage with this close date is critical — don\'t wait.',
    reasoning: 'Highest-urgency open deal. CRO-level single-threaded deal with 22-day silence and close date less than 3 weeks out.',
    evidence: ['CRO (Brandon Wu) attended demo personally — high-intent signal', '22 days of silence after demo — no response to follow-ups', 'Close date June 30 — 18 days away', '$33,600 — highest-value RED deal'],
  },
  {
    id: 'demo_mosaic', name: 'Mosaic - Starter Annual', company: 'Mosaic',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'RED', confidence: 'medium',
    value: 4800, closeDate: '2026-07-08', daysInactive: 28, contacts: 1,
    risk: '28 days inactive with no next step scheduled. Close date 29 days out. Intro call completed but deal drifting.',
    action: 'Re-book the next step with a specific agenda — demo or ROI walkthrough. Vague check-ins are not working.',
    reasoning: 'Intro call completed but 28-day inactivity with no scheduled follow-up. Deal will expire without action.',
    evidence: ['Intro call held — no follow-up scheduled afterward', '28 days since last contact (Derek Lim, Marketing Manager)', 'Close date July 8 — 29 days away', 'Single contact with no backup thread'],
  },
  {
    id: 'demo_leapsome', name: 'Leapsome - Growth Annual', company: 'Leapsome',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'RED', confidence: 'medium',
    value: 14400, closeDate: '2026-07-10', daysInactive: 20, contacts: 1,
    risk: 'Inbound, budget confirmed, then 20-day silence. Close date 29 days. Pattern of qualified deals going quiet after budget confirmation.',
    action: 'Send the personalization demo recording and a concrete next step — security review, procurement intro, or pricing decision. Qualified deals need momentum or they die.',
    reasoning: 'Strong inbound signal (cold email) with confirmed budget, but 20-day silence post-qualification. Classic stall pattern.',
    evidence: ['Inbound from cold email sequence — high intent', 'Budget confirmed in discovery call', '20 days since last contact (Thomas Brauer, Director of Demand Gen)', 'Single contact — no other stakeholder engaged'],
    draftEmail: 'Hi Thomas,\n\nFollowing up on our last conversation — you had confirmed budget and we were aligned on the use case.\n\nI put together a quick personalization walkthrough specific to cold email sequences at your scale. Want to take 20 minutes to look at it together this week?\n\nSharath',
  },
  // ── AMBER ─────────────────────────────────────────────────────────────────
  {
    id: 'demo_demandbase', name: 'Demandbase - Growth Annual', company: 'Demandbase',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'AMBER', confidence: 'medium',
    value: 19200, closeDate: '2026-07-15', daysInactive: 13, contacts: 1,
    risk: 'Competitor evaluation (unnamed) ongoing. Decision maker engaged but no activity in 13 days.',
    action: 'Send a targeted competitive comparison — lead with Churnaut\'s determinism vs probabilistic IP-matching tools. Anchor on privacy and accuracy.',
    reasoning: 'Decision maker bought in but competitor evaluation creates real risk. 13-day gap at this stage needs proactive intervention.',
    evidence: ['Competitor evaluation explicitly mentioned by Angela Torres', '13 days since last contact', 'Single contact (Angela Torres, Director of Marketing Ops)', 'Decision maker engagement is positive — intervention could tip decision'],
  },
  {
    id: 'demo_fullstory', name: 'FullStory - Growth Annual', company: 'FullStory',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'AMBER', confidence: 'medium',
    value: 19200, closeDate: '2026-07-28', daysInactive: 15, contacts: 1,
    risk: 'Two-tool evaluation. 15-day silence post-demo. Close date gives some runway.',
    action: 'Send a comparison one-pager: Churnaut vs the other tools they\'re evaluating. Use the privacy/determinism angle.',
    reasoning: 'Multi-tool evaluation with post-demo silence. Runway exists but inaction will cost this deal.',
    evidence: ['Explicitly evaluating two other tools (Oliver Bennett, VP Marketing)', '15 days since last contact', 'Close date July 28 — time remains but not infinite', 'Single contact with evaluation in progress'],
  },
  {
    id: 'demo_chargebee', name: 'Chargebee - Growth Annual', company: 'Chargebee',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'AMBER', confidence: 'high',
    value: 21600, closeDate: '2026-07-12', daysInactive: 18, contacts: 1,
    risk: 'Mutiny named as direct competitor. 18-day silence at Presentation stage. $22K deal.',
    action: 'Lead with a direct Churnaut vs Mutiny comparison. Mutiny is enterprise-priced and requires identity matching — Churnaut\'s tracked link model is simpler and more accurate for SMB.',
    reasoning: 'Named competitor evaluation (Mutiny) combined with 18-day silence and single contact creates moderate-high risk.',
    evidence: ['Mutiny named as competitor — direct pricing and feature threat', '18 days since last contact (Arjun Mehta, Head of Growth)', 'Single contact — no multi-threading', 'Second demo completed — evaluation is active, not abandoned'],
  },
  {
    id: 'demo_totango', name: 'Totango - Growth Annual', company: 'Totango',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'AMBER', confidence: 'medium',
    value: 14400, closeDate: '2026-07-25', daysInactive: 8, contacts: 1,
    risk: 'Good momentum but single-threaded. Demo scheduled — needs second contact before demo date.',
    action: 'Before the demo, ask Zoe Fischer to bring one more stakeholder — marketing ops or a revenue team lead. Single-threaded demos convert at 40% the rate of multi-stakeholder ones.',
    reasoning: 'Positive trajectory but single-contact risk on a demo-stage deal. Proactive multi-threading now can double close probability.',
    evidence: ['Demo scheduled — positive forward momentum', 'Single contact (Zoe Fischer, VP Marketing) with no backup', '8 days since last contact — still warm', 'Close date July 25 — manageable runway'],
  },
  {
    id: 'demo_cultureamp', name: 'Culture Amp - Growth Annual', company: 'Culture Amp',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'AMBER', confidence: 'medium',
    value: 21600, closeDate: '2026-08-02', daysInactive: 20, contacts: 1,
    risk: 'Positive demo feedback but evaluation open for 20 days with no update. Drifting.',
    action: 'Ask for a clear decision timeline. "Positive feedback" without a next step is a stall — request a procurement or security intro to create structure.',
    reasoning: 'Positive feedback is a good sign but 20-day drift without structure means this evaluation will quietly die.',
    evidence: ['Positive demo feedback received (Jordan Walsh, Director of Growth)', '20 days since last contact — evaluation stalling', 'Single contact with no structured next step', 'Close date Aug 2 gives runway but requires action now'],
  },
  // ── GREEN ─────────────────────────────────────────────────────────────────
  {
    id: 'demo_lattice', name: 'Lattice - Growth Annual', company: 'Lattice',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'GREEN', confidence: 'high',
    value: 18000, closeDate: '2026-07-01', daysInactive: 26, contacts: 1,
    risk: 'Close date July 1 approaching. Ensure procurement path is clear.',
    action: 'Send the contract this week. Close date is 20 days out — surface any procurement blockers now.',
    reasoning: 'Strong champion engagement. VP RevOps is decision maker and showed genuine interest in the personalization use case.',
    evidence: ['VP RevOps (Kevin Park) is champion — strong organizational fit', 'Decision maker explicitly bought in after demo', 'Clear use case: cold email sequence personalization'],
  },
  {
    id: 'demo_rippling', name: 'Rippling - Starter Annual', company: 'Rippling',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Presentation Scheduled', score: 'GREEN', confidence: 'medium',
    value: 9600, closeDate: '2026-07-20', daysInactive: 5, contacts: 2,
    risk: 'ROI doc pending. Keep momentum with two contacts engaged.',
    action: 'Deliver the ROI doc this week while engagement is warm. Two contacts gives multi-threading advantage.',
    reasoning: 'Positive demo with two stakeholders engaged. ROI doc in progress keeps deal structured.',
    evidence: ['Demo went well — positive feedback from Priya Nair', 'Two contacts engaged — strong multi-threading', '5 days since last contact — still very warm'],
  },
  {
    id: 'demo_15five', name: '15Five - Growth Annual', company: '15Five',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'GREEN', confidence: 'high',
    value: 9600, closeDate: '2026-08-05', daysInactive: 4, contacts: 1,
    risk: 'Single contact. Warm lead but ensure first call is booked.',
    action: 'Confirm first call is locked in and prepare a personalization demo specific to Instantly outreach sequences.',
    reasoning: 'Very warm inbound lead with confirmed first call. Short-cycle potential.',
    evidence: ['Described as "very warm lead" by Rachel Kim', 'Runs Instantly for outreach — direct product fit', '4 days since last contact — active'],
  },
  {
    id: 'demo_terminus', name: 'Terminus - Pro Annual', company: 'Terminus',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Contract Sent', score: 'GREEN', confidence: 'high',
    value: 28800, closeDate: '2026-06-25', daysInactive: 6, contacts: 2,
    risk: 'Legal review in progress. Close date imminent — June 25.',
    action: 'Follow up with SVP Revenue on legal timeline today. $29K deal closing in 13 days — surface any blockers.',
    reasoning: 'Contract out with two contacts engaged. Legal review is the only remaining step.',
    evidence: ['Contract sent and in legal review', 'Two senior contacts (James Holloway, SVP Revenue)', 'Close date June 25 — 13 days away', 'High-value $28,800 Pro deal'],
  },
  {
    id: 'demo_churnzero', name: 'ChurnZero - Growth Annual', company: 'ChurnZero',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'GREEN', confidence: 'high',
    value: 14400, closeDate: '2026-08-10', daysInactive: 3, contacts: 3,
    risk: 'Integration docs requested — ensure response is fast.',
    action: 'Send integration documentation today. Multiple stakeholders means faster consensus — use this momentum.',
    reasoning: 'Actively evaluating with multiple stakeholders and integration request. Strong buy signal.',
    evidence: ['3 contacts involved — best multi-threading on any active deal', 'Actively evaluating and requesting integration docs', '3 days since last contact — very active', 'VP Customer Success (Sasha Petrov) is champion'],
  },
  {
    id: 'demo_gainsight', name: 'Gainsight - Pro Annual', company: 'Gainsight',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Contract Sent', score: 'GREEN', confidence: 'high',
    value: 48000, closeDate: '2026-06-22', daysInactive: 8, contacts: 2,
    risk: 'Close date June 22 — 10 days out. Contract needs to close this week.',
    action: 'Call Diane Nguyen today. $48K deal with 10-day close window needs verbal confirmation the contract is progressing through legal.',
    reasoning: 'Highest-value open deal at contract stage with COO as champion. Imminent close.',
    evidence: ['COO (Diane Nguyen) is champion — top-level sponsorship', '$48,000 — highest-value deal in pipeline', 'Contract sent and in review', 'Close date June 22 — 10 days away'],
  },
  {
    id: 'demo_heap', name: 'Heap - Starter Annual', company: 'Heap',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'GREEN', confidence: 'high',
    value: 4800, closeDate: '2026-08-15', daysInactive: 5, contacts: 1,
    risk: 'Single contact. Warm deal — keep momentum.',
    action: 'Run a personalized demo using Apollo-specific outreach sequences to match Mei Zhang\'s workflow.',
    reasoning: 'Enthusiastic prospect with direct product fit (Apollo stack). Fast conversion potential.',
    evidence: ['Described as enthusiastic with great product fit', 'Uses Apollo for outreach — matches personalization use case exactly', '5 days since last contact — warm'],
  },
  {
    id: 'demo_pendo', name: 'Pendo - Growth Annual', company: 'Pendo',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'GREEN', confidence: 'medium',
    value: 24000, closeDate: '2026-08-01', daysInactive: 10, contacts: 1,
    risk: 'Security review sign-off pending. Proactively provide security docs.',
    action: 'Send security documentation proactively — SOC 2 roadmap, data handling overview. Don\'t wait for them to ask again.',
    reasoning: 'Budget approved. Security review is the only blocker. Proactive documentation removes friction.',
    evidence: ['Budget explicitly approved by Kavya Sharma (Director of Demand Gen)', 'Security review is identified blocker — actionable', '10 days since last contact — manageable'],
  },
  {
    id: 'demo_maxio', name: 'Maxio - Growth Annual', company: 'Maxio',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'GREEN', confidence: 'high',
    value: 16800, closeDate: '2026-07-22', daysInactive: 4, contacts: 2,
    risk: 'Proposal sent. Keep contact cadence active to move to contract.',
    action: 'Follow up on proposal — ask for a legal/procurement contact to accelerate contract.',
    reasoning: 'Decision maker confirmed budget with proposal out. Multiple touches and two contacts active.',
    evidence: ['Decision maker (Fiona Marsh, VP Marketing) confirmed budget', 'Proposal sent and active', '4 days since last contact — engaged', 'Two contacts on deal — multi-threaded'],
  },
  {
    id: 'demo_partnerstack', name: 'PartnerStack - Growth Annual', company: 'PartnerStack',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'GREEN', confidence: 'high',
    value: 12000, closeDate: '2026-08-08', daysInactive: 6, contacts: 1,
    risk: 'Single contact. Strong intent signals — close while momentum is high.',
    action: 'Move to proposal this week. Pricing page visits are the strongest buying signal in your pipeline — act now.',
    reasoning: 'Pricing page visited twice — strongest purchase intent signal. Lemlist stack is direct product fit.',
    evidence: ['Visited pricing page twice — highest purchase intent signal', 'Runs Lemlist for outreach — direct product fit', '6 days since last contact — active', 'Revenue Operations Lead (Lily Okafor) — decision-maker adjacent'],
  },
  {
    id: 'demo_rollworks', name: 'Rollworks - Growth Annual', company: 'Rollworks',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Decision Maker Bought-In', score: 'GREEN', confidence: 'high',
    value: 19200, closeDate: '2026-07-18', daysInactive: 3, contacts: 2,
    risk: 'Active deal with strong signals. Maintain momentum.',
    action: 'Lock in next step — procurement intro or contract kickoff. Two contacts engaged means decisions can move fast.',
    reasoning: 'Most active GREEN deal. Decision maker engaged with two contacts and recent activity.',
    evidence: ['Decision maker (Hannah Scott, Head of ABM) actively engaged', 'Two contacts looped in — strong multi-threading', '3 days since last contact — very active', 'Described as "very active" with strong win probability'],
  },
  {
    id: 'demo_mixpanel', name: 'Mixpanel - Growth Annual', company: 'Mixpanel',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'GREEN', confidence: 'medium',
    value: 21600, closeDate: '2026-08-05', daysInactive: 10, contacts: 1,
    risk: 'Procurement cycle may be slow. Get a timeline from Aisha Patel.',
    action: 'Ask for an explicit procurement timeline and the name of the budget owner. $22K deals stall in procurement without executive sponsorship.',
    reasoning: 'Budget approved with moderate activity. Procurement cycle is the main risk — needs structure.',
    evidence: ['Budget explicitly approved (Aisha Patel, Director of Revenue Marketing)', 'Waiting on internal procurement — common stall point', '10 days since last contact — still within normal range'],
  },
  {
    id: 'demo_amplitude', name: 'Amplitude - Pro Annual', company: 'Amplitude',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Contract Sent', score: 'GREEN', confidence: 'high',
    value: 43200, closeDate: '2026-06-28', daysInactive: 5, contacts: 2,
    risk: 'Close date June 28 — 16 days. Contract in review with two contacts.',
    action: 'Follow up with Lucas Hoffman on contract status. $43K deal at final stage — ensure no surprises.',
    reasoning: 'Second-highest value open deal at contract stage with SVP engaged. Strong close probability.',
    evidence: ['SVP Marketing (Lucas Hoffman) is engaged and championing', '$43,200 — second-highest value deal', 'Two contacts on deal — multi-threaded', 'Close date June 28 — 16 days away'],
  },
  {
    id: 'demo_klenty', name: 'Klenty - Starter Annual', company: 'Klenty',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'GREEN', confidence: 'high',
    value: 4800, closeDate: '2026-08-25', daysInactive: 2, contacts: 1,
    risk: 'Brand new deal. Keep energy high and demo prepared.',
    action: 'Prepare a Smartlead-specific personalization demo. Neha Iyer is highly active — strike while momentum is peak.',
    reasoning: 'Freshest deal in pipeline — booked same day with maximum energy. Smartlead stack is a perfect fit.',
    evidence: ['Demo booked same day as last contact — maximum purchase intent', 'Uses Smartlead for outreach — direct product fit', '2 days since last contact — hottest lead in pipeline'],
  },
  {
    id: 'demo_linearb', name: 'LinearB - Starter Annual', company: 'LinearB',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'GREEN', confidence: 'low',
    value: 4800, closeDate: '2026-08-20', daysInactive: 11, contacts: 1,
    risk: 'Low urgency. LinkedIn Ad personalization use case is niche.',
    action: 'Send a LinkedIn Ad personalization use case walkthrough to create urgency before the deal drifts.',
    reasoning: 'Low urgency self-reported. Early stage with runway. Create urgency with a specific use case.',
    evidence: ['Nathan Riley described as low urgency explicitly', 'LinkedIn Ad personalization use case is less common — more education needed', '11 days since last contact — within range but drifting'],
  },
  {
    id: 'demo_metadata', name: 'Metadata.io - Pro Annual', company: 'Metadata',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Contract Sent', score: 'GREEN', confidence: 'medium',
    value: 24000, closeDate: '2026-06-28', daysInactive: 7, contacts: 1,
    risk: 'Legal questions need answers. Close date June 28 — respond to legal promptly.',
    action: 'Respond to the two legal questions today. $24K Pro deal at contract stage — any delay risks the June 28 close.',
    reasoning: 'Contract in final review with specific legal questions. Active response needed to preserve close date.',
    evidence: ['Two specific legal questions raised by Carlos Reyes (VP Demand Gen)', 'Close date June 28 — 16 days away', '$24,000 Pro deal at final contract stage'],
  },
  {
    id: 'demo_planhat', name: 'Planhat - Starter Annual', company: 'Planhat',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Appointment Scheduled', score: 'GREEN', confidence: 'high',
    value: 4800, closeDate: '2026-08-18', daysInactive: 4, contacts: 1,
    risk: 'Discovery call tomorrow. Warm inbound — prepare thoroughly.',
    action: 'Research Planhat\'s current outbound stack before the call. G2 referral means they already trust the category.',
    reasoning: 'Warm inbound from G2 referral with discovery call imminent. High-intent signal.',
    evidence: ['Inbound from G2 referral — pre-validated intent', 'Discovery call scheduled for tomorrow', '4 days since last contact — warm'],
  },
  {
    id: 'demo_engagedly', name: 'Engagedly - Starter Annual', company: 'Engagedly',
    owner: 'Sharath MB', ownerEmail: 'sharusharath215@gmail.com',
    stage: 'Qualified To Buy', score: 'GREEN', confidence: 'high',
    value: 4800, closeDate: '2026-08-20', daysInactive: 3, contacts: 1,
    risk: 'Moving quickly — ensure proposal is ready.',
    action: 'Send the proposal today. Riya Singh is moving fast — don\'t create friction by delaying the next step.',
    reasoning: 'Active, budget-confirmed deal moving quickly through evaluation. Execution deal — just keep pace.',
    evidence: ['Budget confirmed explicitly by Riya Singh (Growth Marketing Manager)', 'Described as "active and engaged, moving quickly"', '3 days since last contact — very active'],
  },
]

// ─── demo sessions (for Links + Analytics pages) ─────────────────────────────
const DEMO_SESSIONS = [
  { visitor_token: 'demo_visitor_1', prospect_name: 'Kevin Park', prospect_email: 'kevin.park@lattice.com', company_name: 'Lattice', job_title: 'VP of Revenue Operations', signal_type: 'cold_email', assigned_rep: 'Sharath MB', click_count: 3, converted: true },
  { visitor_token: 'demo_visitor_2', prospect_name: 'Brandon Wu', prospect_email: 'brandon.wu@clari.com', company_name: 'Clari', job_title: 'Chief Revenue Officer', signal_type: 'linkedin_ad', assigned_rep: 'Sharath MB', click_count: 2, converted: false },
  { visitor_token: 'demo_visitor_3', prospect_name: 'Hannah Scott', prospect_email: 'hannah.scott@rollworks.com', company_name: 'Rollworks', job_title: 'Head of ABM', signal_type: 'cold_email', assigned_rep: 'Sharath MB', click_count: 4, converted: true },
  { visitor_token: 'demo_visitor_4', prospect_name: 'Lily Okafor', prospect_email: 'lily.okafor@partnerstack.com', company_name: 'PartnerStack', job_title: 'Revenue Operations Lead', signal_type: 'linkedin_ad', assigned_rep: 'Sharath MB', click_count: 2, converted: false },
  { visitor_token: 'demo_visitor_5', prospect_name: 'Aisha Patel', prospect_email: 'aisha.patel@mixpanel.com', company_name: 'Mixpanel', job_title: 'Director of Revenue Marketing', signal_type: 'cold_email', assigned_rep: 'Sharath MB', click_count: 1, converted: false },
  { visitor_token: 'demo_visitor_6', prospect_name: 'Riya Singh', prospect_email: 'riya.singh@engagedly.com', company_name: 'Engagedly', job_title: 'Growth Marketing Manager', signal_type: 'google_ad', assigned_rep: 'Sharath MB', click_count: 3, converted: true },
  { visitor_token: 'demo_visitor_7', prospect_name: 'Neha Iyer', prospect_email: 'neha.iyer@klenty.com', company_name: 'Klenty', job_title: 'Growth Manager', signal_type: 'cold_email', assigned_rep: 'Sharath MB', click_count: 5, converted: false },
  { visitor_token: 'demo_visitor_8', prospect_name: 'Kavya Sharma', prospect_email: 'kavya.sharma@pendo.io', company_name: 'Pendo', job_title: 'Director of Demand Gen', signal_type: 'linkedin_ad', assigned_rep: 'Sharath MB', click_count: 2, converted: false },
]

// ─── seed function ────────────────────────────────────────────────────────────
export async function seedDemoData(clientId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date()
    const scoredAt = now.toISOString()

    // 1. Insert deal_scores
    const dealRows = DEMO_DEALS.map(d => ({
      client_id: clientId,
      deal_id: d.id,
      deal_name: d.name,
      score: d.score,
      confidence: d.confidence,
      primary_risk: d.risk,
      next_action: d.action,
      draft_email: d.draftEmail || null,
      rep_name: d.owner,
      rep_email: d.ownerEmail,
      stage: d.stage,
      deal_value: d.value,
      close_date: d.closeDate,
      days_in_stage: Math.floor(d.daysInactive * 0.6),
      last_activity_days: d.daysInactive,
      contact_count: d.contacts,
      website_visits_7d: d.score === 'GREEN' ? Math.floor(Math.random() * 4) + 1 : 0,
      reasoning: d.reasoning,
      evidence: d.evidence,
      data_gaps: [],
      comparison: null,
      what_would_move_score: null,
      scored_at: scoredAt,
    }))

    const { error: dealErr } = await supabaseAdmin.from('deal_scores').insert(dealRows)
    if (dealErr) throw new Error(`deal_scores insert failed: ${dealErr.message}`)

    // 2. Insert deal_score_history
    const historyRows = DEMO_DEALS.map(d => ({
      client_id: clientId,
      deal_id: d.id,
      deal_name: d.name,
      score: d.score,
      confidence: d.confidence,
      scored_at: scoredAt,
    }))
    await supabaseAdmin.from('deal_score_history').insert(historyRows)

    // 3. Insert pipeline_snapshot
    const redCount = DEMO_DEALS.filter(d => d.score === 'RED').length
    const amberCount = DEMO_DEALS.filter(d => d.score === 'AMBER').length
    const greenCount = DEMO_DEALS.filter(d => d.score === 'GREEN').length
    const totalValue = DEMO_DEALS.reduce((s, d) => s + d.value, 0)
    const { error: snapErr } = await supabaseAdmin.from('pipeline_snapshots').insert({
      client_id: clientId,
      total_deals: DEMO_DEALS.length,
      red_count: redCount,
      amber_count: amberCount,
      green_count: greenCount,
      total_pipeline_value: totalValue,
      pressure_score: 68,
    })
    if (snapErr) throw new Error(`pipeline_snapshots insert failed: ${snapErr.message}`)

    // 4. Insert sessions
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sessionRows = DEMO_SESSIONS.map((s, i) => ({
      client_id: clientId,
      visitor_token: s.visitor_token,
      prospect_name: s.prospect_name,
      prospect_email: s.prospect_email,
      company_name: s.company_name,
      job_title: s.job_title,
      signal_type: s.signal_type,
      assigned_rep: s.assigned_rep,
      click_count: s.click_count,
      converted: s.converted,
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(sevenDaysAgo.getTime() + i * 18 * 60 * 60 * 1000).toISOString(),
    }))
    const { error: sessionErr } = await supabaseAdmin.from('sessions').insert(sessionRows)
    if (sessionErr) throw new Error(`sessions insert failed: ${sessionErr.message}`)

    // 5. Insert analytics_events
    const eventRows = DEMO_SESSIONS.flatMap((s, i) =>
      Array.from({ length: s.click_count }, (_, j) => ({
        client_id: clientId,
        session_id: null,
        rule_id: null,
        event_type: 'rule_triggered',
        signal_type: s.signal_type,
        created_at: new Date(sevenDaysAgo.getTime() + (i * 18 + j * 3) * 60 * 60 * 1000).toISOString(),
        metadata: { demo: true, company: s.company_name },
      }))
    )
    const { error: eventErr } = await supabaseAdmin.from('analytics_events').insert(eventRows)
    if (eventErr) throw new Error(`analytics_events insert failed: ${eventErr.message}`)

    // 6. Stamp client with demo_seeded_at
    const { error: clientErr } = await supabaseAdmin
      .from('clients').update({ demo_seeded_at: scoredAt }).eq('id', clientId)
    if (clientErr) throw new Error(`clients update failed: ${clientErr.message}`)

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[demo-seed] seedDemoData error:', msg)
    return { success: false, error: msg }
  }
}

// ─── purge function ───────────────────────────────────────────────────────────
export async function purgeDemoData(clientId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const demoIds = DEMO_DEALS.map(d => d.id)
    const demoVisitorTokens = DEMO_SESSIONS.map(s => s.visitor_token)

    await Promise.all([
      supabaseAdmin.from('deal_scores').delete().eq('client_id', clientId).in('deal_id', demoIds),
      supabaseAdmin.from('deal_score_history').delete().eq('client_id', clientId).in('deal_id', demoIds),
      supabaseAdmin.from('analytics_events').delete().eq('client_id', clientId).eq('metadata->>demo', 'true'),
      supabaseAdmin.from('sessions').delete().eq('client_id', clientId).in('visitor_token', demoVisitorTokens),
    ])

    // Remove the latest pipeline snapshot (the demo one)
    const { data: snap } = await supabaseAdmin
      .from('pipeline_snapshots').select('id').eq('client_id', clientId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (snap?.id) {
      await supabaseAdmin.from('pipeline_snapshots').delete().eq('id', snap.id)
    }

    await supabaseAdmin.from('clients').update({ demo_seeded_at: null }).eq('id', clientId)

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[demo-seed] purgeDemoData error:', msg)
    return { success: false, error: msg }
  }
}
