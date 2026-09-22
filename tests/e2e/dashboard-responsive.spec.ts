import { test, expect } from './fixtures/auth'
import { PLAN_PRICING } from '../../lib/plans'

const hasCredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)

test.describe('dashboard responsive shell', () => {
  test.skip(!hasCredentials, 'Authenticated responsive checks require E2E_EMAIL and E2E_PASSWORD.')

  test('desktop shell exposes the active route and main landmark', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard/analytics')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    await expect(page.getByText('CHURNAUT', { exact: true })).toBeVisible()
    await expect(page.getByText('SIGNAL FIELD', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('home overview keeps Signal Field hierarchy and command actions', async ({ authenticatedPage: page }) => {
    await page.addInitScript(() => localStorage.removeItem('churnaut_onboarding_dismissed'))
    let summaryCalls = 0
    await page.route('**/api/dashboard/summary', async (route) => {
      summaryCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pressure_score: 72,
          pipeline_status: 'NEEDS ATTENTION',
          active_rules_count: 3,
          tracked_links_count: 8,
          sessions_this_week: 21,
          scout_inbox: { has_red_deals: false, top_red_deal: null, top_rep: null },
          recent_activity: [{ event_type: 'Personalized visit', signal_type: 'Cold Email', created_at: new Date().toISOString() }],
        }),
      })
    })
    await page.route('**/api/onboarding/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ snippet_installed: false, first_link_created: false, first_rule_created: false, crm_connected: false, first_personalized_visit: false }) })
    })
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter', monthly_visits: 500, plan_status: 'active' } }) })
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('[data-overview-pilot="true"]')).toHaveCount(1)
    await expect(page.getByText('Pipeline pressure', { exact: true })).toBeVisible()
    await expect(page.getByLabel('72 out of 100 pipeline pressure')).toBeVisible()
    await expect(page.getByText('NEEDS ATTENTION', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Active rules: 3')).toBeVisible()
    await expect(page.getByLabel('Tracked links: 8')).toBeVisible()
    await expect(page.getByLabel('Sessions this week: 21')).toBeVisible()
    await expect(page.getByText('Visit limit reached — personalization is paused until the 1st of next month.')).toBeVisible()
    await expect(page.getByRole('link', { name: /CREATE TRACKED LINK/i })).toHaveAttribute('href', '/dashboard/links')
    await expect(page.getByRole('link', { name: /ADD ROUTING RULE/i })).toHaveAttribute('href', '/dashboard/rules')
    await expect(page.getByRole('link', { name: /Review plan/i })).toHaveAttribute('href', '/dashboard/billing')
    await expect(page.getByText('Needs attention', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Signal feed', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /View full Scout analysis/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Go to Snippet/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create Link/i })).toBeVisible()
    expect(await page.evaluate(() => {
      const pressure = [...document.querySelectorAll('*')].find((node) => node.textContent?.trim() === 'Pipeline pressure')
      const activeRules = [...document.querySelectorAll('*')].find((node) => node.textContent?.trim() === 'Active rules')
      return Boolean(pressure && activeRules && (pressure.compareDocumentPosition(activeRules) & Node.DOCUMENT_POSITION_FOLLOWING))
    })).toBe(true)
    await expect(page.getByRole('link', { name: /CREATE TRACKED LINK/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /ADD ROUTING RULE/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /RUN SCOUT ANALYSIS/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Go to Snippet/i })).toHaveAttribute('href', '/dashboard/snippet')
    await expect(page.getByRole('link', { name: /Create Link/i })).toHaveAttribute('href', '/dashboard/links')
    await expect(page.getByRole('link', { name: /Add Rule/i })).toHaveAttribute('href', '/dashboard/rules')
    await expect(page.getByRole('link', { name: /Connect CRM/i })).toHaveAttribute('href', '/dashboard/integrations/crm')
    await expect(page.getByRole('link', { name: /View Analytics/i })).toHaveAttribute('href', '/dashboard/analytics')
    await expect(page.getByText('Connect HubSpot natively to complete CRM setup.', { exact: true })).toBeVisible()
    await expect(page.getByText('Growth gives you Scout deal intelligence, AI weekly digests, webhook intake for Pipedrive, Zoho & Close, and 10× more tracked visits — starting at $399/mo.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss onboarding checklist' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('churnaut_onboarding_dismissed'))).toBe('true')
    let scoutRequest: { method: string; body: string | null } | null = null
    await page.route('**/api/scout/score', async (route) => {
      scoutRequest = { method: route.request().method(), body: route.request().postData() }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })
    await page.getByRole('button', { name: 'RUN SCOUT ANALYSIS' }).click()
    await expect.poll(() => scoutRequest).toEqual({ method: 'POST', body: null })
    await expect.poll(() => summaryCalls).toBeGreaterThan(1)
    await page.goto('/dashboard/analytics')
    await expect(page.locator('[data-overview-pilot="true"]')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('home overview does not mark setup complete when onboarding status fails', async ({ authenticatedPage: page }) => {
    await page.addInitScript(() => localStorage.removeItem('churnaut_onboarding_dismissed'))
    await page.route('**/api/dashboard/summary', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pressure_score: 20, pipeline_status: 'HEALTHY', active_rules_count: 1, tracked_links_count: 1, sessions_this_week: 1, scout_inbox: { has_red_deals: false, top_red_deal: null, top_rep: null }, recent_activity: [] }) })
    })
    await page.route('**/api/onboarding/status', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unable to load onboarding status' }) })
    })
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter', monthly_visits: 0, plan_status: 'active' } }) })
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Pipeline pressure', { exact: true })).toBeVisible()
    await expect(page.getByText('Setup complete — Churnaut is fully configured and running.', { exact: true })).toHaveCount(0)
    await page.waitForTimeout(4200)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('churnaut_onboarding_dismissed'))).toBeNull()
  })

  test('home overview confirms setup completion before auto-dismissing it', async ({ authenticatedPage: page }) => {
    await page.addInitScript(() => localStorage.removeItem('churnaut_onboarding_dismissed'))
    await page.route('**/api/dashboard/summary', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pressure_score: 42, pipeline_status: 'HEALTHY', active_rules_count: 2, tracked_links_count: 4, sessions_this_week: 7, scout_inbox: { has_red_deals: false, top_red_deal: null, top_rep: null }, recent_activity: [] }) })
    })
    await page.route('**/api/onboarding/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ snippet_installed: true, first_link_created: true, first_rule_created: true, crm_connected: true, first_personalized_visit: true }) })
    })
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter', monthly_visits: 0, plan_status: 'active' } }) })
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Setup complete — Churnaut is fully configured and running.', { exact: true })).toBeVisible()
    await page.waitForTimeout(4200)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('churnaut_onboarding_dismissed'))).toBe('true')
  })

  test('home overview exposes accessible loading and recovers from a summary error', async ({ authenticatedPage: page }) => {
    let releaseSummary!: () => void
    const pendingSummary = new Promise<void>((resolve) => { releaseSummary = resolve })
    let summaryCalls = 0
    await page.route('**/api/dashboard/summary', async (route) => {
      summaryCalls += 1
      if (summaryCalls === 1) {
        await pendingSummary
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic summary outage' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pressure_score: 12, pipeline_status: 'HEALTHY', active_rules_count: 0, tracked_links_count: 0, sessions_this_week: 0, scout_inbox: { has_red_deals: false, top_red_deal: null, top_rep: null }, recent_activity: [] }) })
      }
    })
    await page.route('**/api/onboarding/status', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ snippet_installed: true, first_link_created: true, first_rule_created: true, crm_connected: true, first_personalized_visit: true }) }) })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter', monthly_visits: 0, plan_status: 'active' } }) }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    await expect(page.getByRole('status', { name: 'Loading signal overview' })).toBeVisible()
    releaseSummary()
    await expect(page.getByText('Synthetic summary outage', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Pipeline pressure', { exact: true })).toBeVisible()
    await expect(page.getByText('No recent activities recorded.', { exact: true })).toBeVisible()
    await expect(page.getByText('No urgent items today.', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('analytics keeps the measurement console hierarchy at phone width', async ({ authenticatedPage: page }) => {
    await page.route('**/api/analytics', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        summaryStats: { totalLinksCreatedThisMonth: 8, totalClicksThisMonth: 21, personalizationTriggerRate: 42, overallConversionRate: 18 },
        signalBreakdown: [{ signal: 'Cold Email', links: 8, clicks: 21, conversions: 4, conversion_rate: 18 }, { signal: 'LinkedIn Ad', links: 5, clicks: 13, conversions: 2, conversion_rate: 15 }],
        rulePerformance: [{ rule_id: 'rule-1', priority: 1, signal_type: 'Cold Email', action_type: 'show_calendar', triggers: 8, conversions: 4, conversion_rate: 50 }],
        liftReport: { personalized_sessions: 10, unpersonalized_sessions: 8, personalized_rate: 30, baseline_rate: 12, overall_lift_pp: 18, rules: [{ rule_id: 'rule-1', signal_type: 'Cold Email', action_type: 'show_calendar', personalized_sessions: 10, personalized_rate: 30, baseline_rate: 12, lift_pp: 18 }] },
        recentEvents: [{ id: 'e2e-event', event_type: 'Personalized visit', signal_type: 'Cold Email', created_at: new Date().toISOString(), prospect_name: 'Synthetic prospect' }],
        repPerformance: [{ rep: 'Synthetic Rep', links: 8, conversions: 4, conversion_rate: 50 }],
        dailyVolume: [{ date: 'Yesterday', rawDate: new Date().toISOString(), count: 3 }, { date: 'Today', rawDate: new Date().toISOString(), count: 4 }],
      }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/analytics')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Outcome telemetry' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Signal volume' })).toBeVisible()
    await expect(page.getByLabel('30-day personalization volume chart')).toBeVisible()
    await expect(page.getByText('Personalization lift', { exact: true })).toBeVisible()
    await expect(page.getByText('Cold Email', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Synthetic Rep', { exact: true })).toBeVisible()
    await expect(page.getByText('50%', { exact: true }).first()).toBeVisible()
    expect(await page.evaluate(() => {
      const signal = document.querySelector('[aria-label="Signal volume"]')
      const tables = [...document.querySelectorAll('table')]
      return Boolean(signal && tables[0] && (signal.compareDocumentPosition(tables[0]) & Node.DOCUMENT_POSITION_FOLLOWING))
    })).toBe(true)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('analytics distinguishes loading, retry, and negative measured lift', async ({ authenticatedPage: page }) => {
    let calls = 0
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve })
    const payload = { summaryStats: { totalLinksCreatedThisMonth: 2, totalClicksThisMonth: 4, personalizationTriggerRate: 12, overallConversionRate: 8 }, signalBreakdown: [{ signal: 'Cold Email', links: 2, clicks: 4, conversions: 0, conversion_rate: 0 }], rulePerformance: [], liftReport: { personalized_sessions: 8, unpersonalized_sessions: 10, personalized_rate: 4, baseline_rate: 8, overall_lift_pp: -4, rules: [] }, recentEvents: [{ id: 'event-negative', event_type: 'Personalized visit', signal_type: 'Cold Email', created_at: new Date().toISOString(), prospect_name: 'Synthetic prospect' }], repPerformance: [], dailyVolume: [{ date: 'Today', rawDate: new Date().toISOString(), count: 2 }] }
    await page.route('**/api/analytics', async (route) => {
      calls += 1
      if (calls === 1) { await firstPending; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic analytics outage' }) }) }
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/analytics')
    await expect(page.getByRole('status').filter({ hasText: 'Retrieving measurement signals' })).toBeVisible()
    releaseFirst()
    await expect(page.getByText('Synthetic analytics outage', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Personalization is trailing baseline', { exact: true })).toBeVisible()
    await expect(page.getByText('-4pp', { exact: true })).toBeVisible()
    await expect(page.getByLabel('30-day personalization volume chart')).toBeVisible()
    await expect(page.getByText('No active rules mapped.', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('analytics keeps no-activity state truthful', async ({ authenticatedPage: page }) => {
    await page.route('**/api/analytics', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summaryStats: { totalLinksCreatedThisMonth: 0, totalClicksThisMonth: 0, personalizationTriggerRate: 0, overallConversionRate: 0 }, signalBreakdown: [], rulePerformance: [], liftReport: { personalized_sessions: 0, unpersonalized_sessions: 0, personalized_rate: 0, baseline_rate: 0, overall_lift_pp: 0, rules: [] }, recentEvents: [], repPerformance: [], dailyVolume: [] }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/analytics')
    await expect(page.getByText('No activity yet', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Snippet' })).toHaveAttribute('href', '/dashboard/snippet')
    await expect(page.getByText('Personalization is moving outcomes', { exact: true })).toHaveCount(0)
  })

  test('Scout keeps pipeline state, action queue, health controls, and deal disclosure semantic', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) })
    })
    await page.route('**/api/scout/pipeline*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        pipeline_snapshot: { id: 'snapshot', total_deals: 3, red_count: 1, amber_count: 1, green_count: 1, total_pipeline_value: 120000, pressure_score: 72, created_at: new Date().toISOString() },
        deal_scores: [{ deal_id: 'deal-red', id: 'deal-red', deal_name: 'Synthetic Red Deal', stage: 'Evaluation', deal_value: 50000, close_date: null, days_in_stage: 12, last_activity_days: 4, contact_count: 2, website_visits_7d: 3, score: 'RED', primary_risk: 'No recent rep activity', next_action: 'Re-engage the buyer today', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test', reasoning: 'The buyer went quiet after evaluation.', confidence: 'high', evidence: ['No meeting in 14 days'], comparison: 'Similar stalled deals close late.', what_would_move_score: 'A confirmed meeting this week.', data_gaps: ['Missing current champion title.'], score_trajectory: [{ scored_at: '2026-09-20T00:00:00.000Z', score: 'AMBER' }, { scored_at: '2026-09-21T00:00:00.000Z', score: 'RED' }] }, { deal_id: 'deal-amber', id: 'deal-amber', deal_name: 'Synthetic Amber Deal', stage: 'Discovery', deal_value: 40000, close_date: null, days_in_stage: 4, last_activity_days: 2, contact_count: 1, website_visits_7d: 1, score: 'AMBER', primary_risk: 'Slow movement', next_action: 'Confirm timeline', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }, { deal_id: 'deal-green', id: 'deal-green', deal_name: 'Synthetic Green Deal', stage: 'Proposal', deal_value: 30000, close_date: null, days_in_stage: 2, last_activity_days: 1, contact_count: 3, website_visits_7d: 5, score: 'GREEN', primary_risk: 'None', next_action: 'Keep momentum', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }], acceleration_triggers: [{ prospect_name: 'High Intent Prospect', company_name: 'Acme Co', deal_stage: 'Evaluation', last_visit_timestamp: '2026-09-21T12:00:00.000Z', deal_value: 85000, deal_id: 'deal-trigger', rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }] }) })
    })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    let nudgeBody: Record<string, unknown> | null = null
    let nudgeCalls = 0
    let releaseNudge!: () => void
    const nudgeGate = new Promise<void>((resolve) => { releaseNudge = resolve })
    await page.route('**/api/scout/nudge', async (route) => {
      nudgeCalls += 1
      nudgeBody = route.request().postDataJSON()
      if (nudgeCalls === 1) {
        await nudgeGate
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Nudge unavailable.' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/scout')
    await expect(page.getByRole('heading', { name: 'Pipeline state' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Action queue' })).toBeVisible()
    await expect(page.getByText('PIPELINE HEALTH', { exact: true })).toBeVisible()
    await expect(page.getByText('No blind spots detected across your team.', { exact: true })).toBeVisible()
    const redTab = page.getByRole('tab', { name: /AT RISK \(1\)/i })
    await expect(redTab).toBeVisible()
    await expect(redTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /WARNING \(1\)/i })).toHaveAttribute('aria-selected', 'false')
    expect(await page.evaluate(() => {
      const labels = ['Pipeline state', 'Action queue', 'PIPELINE HEALTH']
      const nodes = labels.map((label) => [...document.querySelectorAll('h1,h2,h3,h4,span')].find((node) => node.textContent?.trim() === label))
      return nodes.every(Boolean) && nodes[0]!.compareDocumentPosition(nodes[1]!) & Node.DOCUMENT_POSITION_FOLLOWING && nodes[1]!.compareDocumentPosition(nodes[2]!) & Node.DOCUMENT_POSITION_FOLLOWING
    })).toBe(true)
    const dealToggle = page.getByRole('button', { name: /Synthetic Red Deal/i }).first()
    const before = await dealToggle.getAttribute('aria-expanded')
    if (before !== 'true') await dealToggle.click()
    await expect(dealToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('The buyer went quiet after evaluation.', { exact: true })).toBeVisible()
    await expect(page.getByText('No meeting in 14 days', { exact: true })).toBeVisible()
    await expect(page.getByText('Similar stalled deals close late.', { exact: true })).toBeVisible()
    await expect(page.getByText('A confirmed meeting this week.', { exact: true })).toBeVisible()
    await expect(page.getByText('Missing current champion title.', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: /2026.*AMBER/i })).toBeVisible()
    await expect(page.getByRole('img', { name: /2026.*RED/i })).toBeVisible()
    await page.getByRole('button', { name: 'NUDGE REP' }).first().click()
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByLabel('To Representative')).toHaveValue(/Synthetic Rep <rep@example.test>/)
    await page.getByLabel('Subject').fill('Synthetic subject')
    await page.getByLabel('Email Body Message').fill('Synthetic body')
    await page.getByRole('button', { name: 'SEND NUDGE' }).click()
    await expect(page.getByRole('button', { name: 'SENDING...' })).toBeDisabled()
    releaseNudge()
    await expect.poll(() => nudgeBody).toEqual({ deal_id: 'deal-red', deal_name: 'Synthetic Red Deal', rep_email: 'rep@example.test', rep_name: 'Synthetic Rep', message: 'Subject: Synthetic subject\n\nSynthetic body' })
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toBeVisible()
    await expect(page.getByLabel('Subject')).toHaveValue('Synthetic subject')
    await expect(page.getByLabel('Email Body Message')).toHaveValue('Synthetic body')
    await page.getByRole('button', { name: 'SEND NUDGE' }).click()
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toHaveCount(0)
    await page.getByRole('button', { name: /NUDGE REP/i }).first().click()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toHaveCount(0)
    const triggerDisclosure = page.getByRole('button', { name: 'DEAL ACCELERATION TRIGGERS' })
    await expect(triggerDisclosure).toHaveAttribute('aria-expanded', 'false')
    await triggerDisclosure.click()
    await expect(triggerDisclosure).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: 'NOTIFY REP' }).click()
    await expect(page.getByRole('dialog', { name: /Send alerts notification/i })).toBeVisible()
    await expect(page.getByLabel('To Representative')).toHaveValue(/Synthetic Rep <rep@example.test>/)
    await page.getByRole('button', { name: 'SEND NUDGE' }).click()
    await expect.poll(() => nudgeBody).toEqual({
      deal_id: 'deal-trigger',
      deal_name: 'High Intent Prospect - Acme Co',
      rep_email: 'rep@example.test',
      rep_name: 'Synthetic Rep',
      message: 'Subject: VIP Prospect Activity: High Intent Prospect at Acme Co\n\nHi Synthetic Rep,\n\nGreat news! High Intent Prospect from Acme Co just visited our website and triggered personalization rules in the last 24 hours.\n\nThey have an open deal in the "Evaluation" stage (Value: $85,000).\n\nThis is a high-intent signal! Please reach out to them today to accelerate this deal.\n\nBest,\nSales Operations',
    })
    await expect(page.getByRole('dialog', { name: /Send alerts notification/i })).toHaveCount(0)
    await redTab.focus()
    await page.keyboard.press('ArrowRight')
    const amberTab = page.getByRole('tab', { name: /WARNING \(1\)/i })
    await expect(amberTab).toBeFocused()
    await expect(amberTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Synthetic Amber Deal', { exact: true })).toBeVisible()
    const amberDealToggle = page.getByRole('button', { name: /Synthetic Amber Deal/i }).first()
    await expect(amberDealToggle).toHaveAttribute('aria-expanded', 'false')
    await amberDealToggle.press('Enter')
    await expect(amberDealToggle).toHaveAttribute('aria-expanded', 'true')
    await amberTab.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(redTab).toBeFocused()
    await expect(redTab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    const greenTab = page.getByRole('tab', { name: /HEALTHY \(1\)/i })
    await expect(greenTab).toBeFocused()
    await expect(greenTab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(redTab).toBeFocused()
    await expect(redTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'RUN SCOUT ANALYSIS' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Scout resolves access before loading data and preserves the prior snapshot during analysis', async ({ authenticatedPage: page }) => {
    let releaseClient!: () => void
    let releaseScore!: () => void
    let pipelineCalls = 0
    const pipelineUrls: string[] = []
    let scoreRequest: { method: string; body: string | null } | null = null
    const clientGate = new Promise<void>((resolve) => { releaseClient = resolve })
    const scoreGate = new Promise<void>((resolve) => { releaseScore = resolve })
    const snapshot = (pressure_score: number, created_at = new Date().toISOString()) => ({
      id: `snapshot-${pressure_score}`, total_deals: 1, red_count: 1, amber_count: 0, green_count: 0,
      total_pipeline_value: pressure_score === 72 ? 120000 : 145000, pressure_score, created_at,
    })
    await page.route('**/api/client', async (route) => {
      await clientGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) })
    })
    await page.route('**/api/scout/pipeline*', async (route) => {
      pipelineCalls += 1
      pipelineUrls.push(route.request().url())
      const refreshed = route.request().url().includes('refresh=true')
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        pipeline_snapshot: snapshot(refreshed ? 41 : 72),
        deal_scores: [{ deal_id: 'scout-deal', id: 'scout-deal', deal_name: 'Held Snapshot Deal', stage: 'Evaluation', deal_value: 120000, close_date: null, days_in_stage: 6, last_activity_days: 2, contact_count: 2, website_visits_7d: 4, score: 'RED', primary_risk: 'No recent activity', next_action: 'Contact buyer', draft_email: null, rep_name: 'Rep One', rep_email: 'rep@example.test' }],
        acceleration_triggers: [],
      }) })
    })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/score', async (route) => {
      scoreRequest = { method: route.request().method(), body: route.request().postData() }
      await scoreGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(() => localStorage.setItem('scout_previous_scores', JSON.stringify({ 'scout-deal': 'AMBER' })))
    await page.goto('/dashboard/scout')
    await expect(page.getByRole('status', { name: 'Checking Scout access' })).toBeVisible()
    await expect(page.getByText('Available on the Growth plan', { exact: true })).toHaveCount(0)
    expect(pipelineCalls).toBe(0)
    releaseClient()
    await expect(page.getByText('Held Snapshot Deal', { exact: true })).toBeVisible()
    await expect(page.getByText('$120,000', { exact: true })).toBeVisible()
    await expect(page.getByText('Held Snapshot Deal moved to RED', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('scout_previous_scores') || '{}')['scout-deal'])).toBe('RED')
    await expect(page.getByText('72', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'RUN SCOUT ANALYSIS' }).click()
    await expect(page.getByRole('button', { name: 'Analyzing...' })).toBeDisabled()
    await expect.poll(() => scoreRequest).toEqual({ method: 'POST', body: null })
    await expect(page.getByText('Held Snapshot Deal', { exact: true })).toBeVisible()
    await expect(page.getByText('$120,000', { exact: true })).toBeVisible()
    releaseScore()
    await expect(page.getByText('$145,000', { exact: true })).toBeVisible()
    await expect.poll(() => pipelineCalls).toBe(2)
    expect(pipelineUrls[0]).not.toContain('refresh=true')
    expect(pipelineUrls[1]).toContain('refresh=true')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Scout Starter access resolves to the Growth gate without starting Scout requests', async ({ authenticatedPage: page }) => {
    let releaseClient!: () => void
    let pipelineCalls = 0
    const clientGate = new Promise<void>((resolve) => { releaseClient = resolve })
    await page.route('**/api/client', async (route) => {
      await clientGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter' } }) })
    })
    await page.route('**/api/scout/**', async (route) => {
      pipelineCalls += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'should not request Scout before access resolves' }) })
    })
    await page.goto('/dashboard/scout')
    await expect(page.getByRole('status', { name: 'Checking Scout access' })).toBeVisible()
    expect(pipelineCalls).toBe(0)
    releaseClient()
    await expect(page.getByText('Available on the Growth plan', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Upgrade to Growth/i })).toHaveAttribute('href', '/dashboard/billing')
    expect(pipelineCalls).toBe(0)
  })

  test('Scout pipeline loading exposes a truthful retry that does not force refresh', async ({ authenticatedPage: page }) => {
    let releasePipeline!: () => void
    let pipelineCalls = 0
    const pipelineGate = new Promise<void>((resolve) => { releasePipeline = resolve })
    const pipelineUrls: string[] = []
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/scout/pipeline*', async (route) => {
      pipelineCalls += 1
      pipelineUrls.push(route.request().url())
      if (pipelineCalls === 1) {
        await pipelineGate
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Pipeline unavailable.' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          pipeline_snapshot: { id: 'recovered', total_deals: 1, red_count: 0, amber_count: 1, green_count: 0, total_pipeline_value: 50000, pressure_score: 33, created_at: new Date().toISOString() },
          deal_scores: [{ deal_id: 'recovered-deal', id: 'recovered-deal', deal_name: 'Recovered Pipeline', stage: 'Discovery', deal_value: 50000, close_date: null, days_in_stage: 2, last_activity_days: 1, contact_count: 1, website_visits_7d: 0, score: 'AMBER', primary_risk: 'Needs review', next_action: 'Confirm timeline', draft_email: null, rep_name: 'Rep', rep_email: 'rep@example.test' }],
          acceleration_triggers: [],
        }) })
      }
    })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.goto('/dashboard/scout')
    await expect(page.getByRole('status', { name: 'Loading Scout pipeline' })).toHaveAttribute('aria-busy', 'true')
    releasePipeline()
    await expect(page.getByText('Pipeline unavailable.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Recovered Pipeline', { exact: true })).toBeVisible()
    expect(pipelineUrls[0]).not.toContain('refresh=true')
    expect(pipelineUrls[1]).not.toContain('refresh=true')
  })

  test('Scout keeps pipeline truth when auxiliary intelligence requests fail', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/scout/pipeline*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        pipeline_snapshot: { id: 'snapshot', total_deals: 1, red_count: 1, amber_count: 0, green_count: 0, total_pipeline_value: 90000, pressure_score: 64, created_at: new Date().toISOString() },
        deal_scores: [{ deal_id: 'aux-deal', id: 'aux-deal', deal_name: 'Pipeline Survives', stage: 'Evaluation', deal_value: 90000, close_date: null, days_in_stage: 3, last_activity_days: 1, contact_count: 1, website_visits_7d: 2, score: 'RED', primary_risk: 'Stalled', next_action: 'Follow up', draft_email: null, rep_name: 'Rep', rep_email: 'rep@example.test' }],
        acceleration_triggers: [],
      }) })
    })
    await page.route('**/api/scout/blindspots', async (route) => { await route.abort('failed') })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Archive unavailable.' }) }) })
    await page.goto('/dashboard/scout')
    await expect(page.getByText('Pipeline Survives', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pipeline state' })).toBeVisible()
    await expect(page.getByText('No blind spots detected across your team.', { exact: true })).toHaveCount(0)
    const repSection = page.getByRole('button', { name: 'REP INTELLIGENCE' })
    if (await repSection.getAttribute('aria-expanded') !== 'true') await repSection.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to load rep intelligence.' })).toBeVisible()
    const obitSection = page.getByRole('button', { name: 'DEAL OBITUARIES' })
    await obitSection.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Archive unavailable.' })).toBeVisible()
    await expect(page.getByText('No closed-lost deals found.', { exact: false })).toHaveCount(0)
  })

  test('Scout rep intelligence keeps severity textual and preserves the real blind-spot descriptions', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/scout/pipeline*', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pipeline_snapshot: { id: 'snap', total_deals: 1, red_count: 1, amber_count: 0, green_count: 0, total_pipeline_value: 20000, pressure_score: 81, created_at: new Date().toISOString() }, deal_scores: [{ deal_id: 'blind-deal', id: 'blind-deal', deal_name: 'Blind Spot Deal', stage: 'Evaluation', deal_value: 20000, close_date: null, days_in_stage: 5, last_activity_days: 2, contact_count: 1, website_visits_7d: 1, score: 'RED', primary_risk: 'Stalled', next_action: 'Follow up', draft_email: null, rep_name: 'Pattern Rep', rep_email: 'rep@example.test' }], acceleration_triggers: [] }) }) })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ rep_name: 'Pattern Rep', deal_count: 2, blind_spots: [{ type: 'Follow-up gap', severity: 'critical', description: 'Critical follow-up gap.' }, { type: 'Stage drift', severity: 'warning', description: 'Warning stage drift.' }] }]) }) })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.goto('/dashboard/scout')
    await expect(page.getByText('CRITICAL', { exact: true })).toBeVisible()
    await expect(page.getByText('WARNING', { exact: true })).toBeVisible()
    await expect(page.getByText('Critical follow-up gap.', { exact: true })).toBeVisible()
    await expect(page.getByText('Warning stage drift.', { exact: true })).toBeVisible()
  })

  test('Scout obituary archive separates a true empty state from generation and refreshes the result', async ({ authenticatedPage: page }) => {
    let obituaryGets = 0
    let releaseGeneration!: () => void
    let generationBody: string | null = 'unset'
    const generationGate = new Promise<void>((resolve) => { releaseGeneration = resolve })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/scout/pipeline*', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pipeline_snapshot: { id: 'snap', total_deals: 1, red_count: 0, amber_count: 0, green_count: 1, total_pipeline_value: 12000, pressure_score: 0, created_at: new Date().toISOString() }, deal_scores: [{ deal_id: 'healthy-1', id: 'healthy-1', deal_name: 'Healthy Deal', stage: 'Proposal', deal_value: 12000, close_date: null, days_in_stage: 1, last_activity_days: 1, contact_count: 1, website_visits_7d: 1, score: 'GREEN', primary_risk: 'None', next_action: 'Keep momentum', draft_email: null, rep_name: 'Rep', rep_email: 'rep@example.test' }], acceleration_triggers: [] }) }) })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/obituaries', async (route) => {
      if (route.request().method() === 'GET') {
        obituaryGets += 1
        const body = obituaryGets === 1 ? [] : [{ id: 'obit-1', deal_id: 'lost-1', deal_name: 'Lost Deal', deal_value: 78000, close_date: '2026-09-20', stage_died_in: 'Negotiation', days_in_final_stage: 18, likely_cause: 'No champion', what_rep_could_do: 'Confirm executive sponsor.', pattern_match: 'Late-stage silence.', full_obituary: 'The deal went quiet.', created_at: new Date().toISOString() }]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      } else {
        generationBody = route.request().postData()
        await generationGate
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1 }) })
      }
    })
    await page.goto('/dashboard/scout')
    const obitSection = page.getByRole('button', { name: 'DEAL OBITUARIES' })
    await obitSection.click()
    await expect(page.getByText('No closed-lost deals found.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'GENERATE OBITUARIES' }).click()
    await expect(page.getByRole('button', { name: 'GENERATING...' })).toBeDisabled()
    expect(generationBody).toBeNull()
    releaseGeneration()
    await expect(page.getByText('Lost Deal', { exact: true })).toBeVisible()
    await expect(page.getByText('No champion', { exact: true })).toBeVisible()
    await expect(page.getByText('Late-stage silence.', { exact: true })).toBeVisible()
    await expect(page.getByText('Confirm executive sponsor.', { exact: true })).toBeVisible()
  })

  test('rules and tracked links expose Signal Field workstation semantics', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/playbooks', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [] }) }) })
    let reorderPayload: unknown = null
    let togglePayload: unknown = null
    let singleBody: Record<string, unknown> | null = null
    await page.route('**/api/rules', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [
          { id: 'rule-1', priority: 1, active: true, signal_type: 'Cold Email', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.test/calendar' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() },
          { id: 'rule-2', priority: 2, active: false, signal_type: 'LinkedIn Ad', conditions: { job_title_contains: 'VP' }, action_type: 'inject_copy', action_payload: {}, target_selector: '.headline', variant_content: 'Synthetic copy', created_at: new Date().toISOString() },
          { id: 'rule-3', priority: 3, active: true, signal_type: 'Returning Visitor', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.test/calendar' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() },
        ] }) })
      } else {
        const body = route.request().postDataJSON()
        if (body && typeof body === 'object' && 'rules' in body) reorderPayload = body
        else togglePayload = body
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.route('**/api/links?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: 1, totalPages: 1, sessions: [
        { id: 'link-active', prospect_name: 'Active Prospect', company_name: 'Acme', signal_type: 'Cold Email', assigned_rep: 'Rep A', click_count: 4, expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString(), tracked_url: 'https://churnaut.test/a' },
        { id: 'link-permanent', prospect_name: 'Permanent Prospect', company_name: 'Beta', signal_type: 'LinkedIn Ad', assigned_rep: 'Rep B', click_count: 2, expires_at: null, created_at: new Date().toISOString(), tracked_url: 'https://churnaut.test/b' },
        { id: 'link-expired', prospect_name: 'Expired Prospect', company_name: 'Gamma', signal_type: 'Google Ad', assigned_rep: 'Rep C', click_count: 0, expires_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date().toISOString(), tracked_url: 'https://churnaut.test/c' },
      ] }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/rules')
    await expect(page.getByRole('tab', { name: 'My Rules' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Playbook Library' })).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByRole('switch', { name: /Activate rule 1/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Move rule 1 down' })).toBeVisible()
    await page.getByRole('switch', { name: /Activate rule 1/i }).click()
    await expect.poll(() => togglePayload).toEqual({ id: 'rule-1', active: false })
    await expect(page.getByRole('switch', { name: /Activate rule 1/i })).toHaveAttribute('aria-checked', 'false')
    const ruleCards = page.locator('[draggable="true"]')
    await expect(ruleCards.nth(0)).toContainText('Cold Email')
    await expect(ruleCards.nth(1)).toContainText('LinkedIn Ad')
    await page.getByRole('button', { name: 'Move rule 1 down' }).click()
    await expect(ruleCards.nth(0)).toContainText('LinkedIn Ad')
    await expect(ruleCards.nth(1)).toContainText('Cold Email')
    await expect.poll(() => reorderPayload).toEqual({ rules: [{ id: 'rule-2', priority: 1 }, { id: 'rule-1', priority: 2 }, { id: 'rule-3', priority: 3 }] })
    await page.getByRole('tab', { name: 'My Rules' }).focus()
    await expect(page.getByRole('tab', { name: 'My Rules' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Playbook Library' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Playbook Library' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: 'My Rules' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Playbook Library' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(page.getByRole('tab', { name: 'My Rules' })).toBeFocused()
    await page.goto('/dashboard/links')
    await expect(page.getByText('Active', { exact: true })).toBeVisible()
    await expect(page.getByText('Permanent', { exact: true })).toBeVisible()
    await expect(page.getByText('Expired', { exact: true })).toBeVisible()
    await expect(page.getByText('Rep A', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '+ NEW LINK' }).click()
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Single Link/i })).toHaveAttribute('aria-controls', 'single-link-panel')
    await expect(page.getByRole('tab', { name: /Bulk Upload/i })).toHaveAttribute('aria-controls', 'bulk-link-panel')
    await page.getByRole('tab', { name: /Single Link/i }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /Bulk Upload/i })).toBeFocused()
    await expect(page.getByRole('tab', { name: /Bulk Upload/i })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('tab', { name: /Single Link/i })).toBeFocused()
    await page.route('**/api/links', async (route) => {
      if (route.request().method() === 'POST') {
        singleBody = route.request().postDataJSON()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, trackedUrl: 'https://churnaut.test/generated' }) })
      }
      else await route.continue()
    })
    await page.getByLabel('Destination URL (Required)').fill('https://example.test/landing')
    await page.getByRole('button', { name: 'GENERATE TRACKED LINK' }).click()
    await expect(page.getByText('LINK GENERATED SUCCESSFULLY', { exact: true })).toBeVisible()
    await expect.poll(() => singleBody).toEqual({ prospect_name: '', prospect_email: '', company_name: '', job_title: '', signal_type: 'Cold Email', assigned_rep: '', destination_url: 'https://example.test/landing', expires_in_days: 30 })
    await expect(page.getByLabel('Tracked Link URL')).toHaveValue('https://churnaut.test/generated')
    await expect(page.getByRole('button', { name: 'COPY' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate Another' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('activation ledgers preserve pagination, plan gates, and library warning states', async ({ authenticatedPage: page }) => {
    const requestedQueries: string[] = []
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter' } }) })
    })
    await page.route('**/api/links?*', async (route) => {
      const url = new URL(route.request().url())
      const requestedPage = url.searchParams.get('page') || '1'
      requestedQueries.push(url.search)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ page: Number(requestedPage), totalPages: 2, sessions: [{ id: `page-${requestedPage}`, prospect_name: `Prospect ${requestedPage}`, company_name: 'Synthetic Co', signal_type: 'Cold Email', assigned_rep: 'Rep', click_count: 1, expires_at: null, created_at: new Date().toISOString(), tracked_url: `https://churnaut.test/${requestedPage}` }] }),
      })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/links')
    await expect(page.getByText('Prospect 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PREVIOUS' })).toBeDisabled()
    await page.getByRole('button', { name: 'NEXT →' }).click()
    await expect.poll(() => requestedQueries.some((query) => query.includes('page=2') && query.includes('limit=50'))).toBe(true)
    await expect(page.getByText('Prospect 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PREVIOUS' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'NEXT →' })).toBeDisabled()
    await page.getByRole('button', { name: 'PREVIOUS' }).click()
    await expect(page.getByText('Prospect 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'PREVIOUS' })).toBeDisabled()

    await page.getByRole('button', { name: '+ NEW LINK' }).click()
    const bulkTab = page.getByRole('tab', { name: 'Bulk Upload — Growth' })
    await expect(bulkTab).toBeDisabled()
    await page.getByRole('tab', { name: 'Single Link' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Single Link' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Single Link' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(page.getByRole('tab', { name: 'Single Link' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Single Link' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Single Link' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')

    await page.route('**/api/playbooks', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [], warning: 'Table not seeded yet' }) })
    })
    await page.goto('/dashboard/playbooks')
    await expect(page.getByText('Table not seeded yet', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Growth bulk links preserve CSV filtering and validation states', async ({ authenticatedPage: page }) => {
    let bulkBody: Record<string, unknown> | null = null
    let bulkCalls = 0
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) })
    })
    await page.route('**/api/links?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: 1, totalPages: 1, sessions: [] }) })
    })
    await page.route('**/api/links/bulk', async (route) => {
      bulkCalls += 1
      bulkBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ status: 'Success', prospect_name: 'Valid Prospect' }] }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/links')
    await page.getByRole('button', { name: '+ NEW LINK' }).click()
    await page.getByRole('tab', { name: 'Bulk Upload (CSV)' }).click()
    await page.locator('#csv-file-input').setInputFiles({
      name: 'links.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('prospect_name,prospect_email,company_name,job_title,signal_type,assigned_rep,destination_url\nValid Prospect,valid@example.test,Acme,VP,Cold Email,Rep,https://example.test/valid\nMissing Destination,missing@example.test,Acme,VP,Cold Email,Rep,\n'),
    })
    await page.getByRole('button', { name: 'UPLOAD AND GENERATE' }).click()
    await expect.poll(() => bulkBody).toEqual({ rows: [{ prospect_name: 'Valid Prospect', prospect_email: 'valid@example.test', company_name: 'Acme', job_title: 'VP', signal_type: 'Cold Email', assigned_rep: 'Rep', destination_url: 'https://example.test/valid', expires_in_days: 30 }] })
    await expect(page.getByText('SUCCESSFULLY PROCESSED 1 / 1 LINKS', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear Results' }).click()
    await page.locator('#csv-file-input').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('prospect_name,prospect_email\nOnly Name,only@example.test\n') })
    await page.getByRole('button', { name: 'UPLOAD AND GENERATE' }).click()
    await expect(page.getByText('Missing required columns in CSV:', { exact: false })).toBeVisible()
    expect(bulkCalls).toBe(1)
  })

  test('Playbooks separates fetch failure from warning and recovers on retry', async ({ authenticatedPage: page }) => {
    let calls = 0
    await page.route('**/api/playbooks', async (route) => {
      calls += 1
      if (calls === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic playbook outage' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [], warning: 'Table not seeded yet' }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/playbooks')
    await expect(page.getByRole('alert')).toContainText('Synthetic playbook outage')
    await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()
    await expect(page.getByText('PLAYBOOK LIBRARY NOTICE', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'TRY AGAIN' }).click()
    await expect(page.getByText('Table not seeded yet', { exact: true })).toBeVisible()
    await expect(page.getByText('PLAYBOOK LIBRARY NOTICE', { exact: true })).toBeVisible()
  })

  test('Starter rule limits remain explicit and do not expose a sixth-rule action', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter' } }) })
    })
    await page.route('**/api/rules', async (route) => {
      if (route.request().method() === 'GET') {
        const rules = Array.from({ length: 5 }, (_, index) => ({ id: `starter-rule-${index + 1}`, priority: index + 1, active: true, signal_type: 'Cold Email', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.test/calendar' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() }))
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/rules')
    await expect(page.getByText('5 Rule Limit Reached', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ ADD ROUTING RULE', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Upgrade to Growth/i })).toHaveAttribute('href', '/dashboard/billing')
  })

  test('Rules protect edit, create, delete, and AI copywriter contracts', async ({ authenticatedPage: page }) => {
    const existingRule = { id: 'rule-edit', priority: 1, active: true, signal_type: 'Cold Email', conditions: {}, action_type: 'inject_copy', action_payload: { content: 'Old copy', variant_content: 'Old copy', swaps: [{ selector: '.headline', content: 'Old copy' }] }, target_selector: '.headline', variant_content: 'Old copy', created_at: new Date().toISOString() }
    let rules: Array<Record<string, unknown>> = [existingRule]
    let editBody: Record<string, unknown> | null = null
    let createBody: Record<string, unknown> | null = null
    let deleteUrl = ''
    let aiBody: Record<string, unknown> | null = null
    let updatePatchCount = 0
    let aiResolve!: () => void
    const aiPending = new Promise<void>((resolve) => { aiResolve = resolve })

    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) })
    })
    await page.route('**/api/rules**', async (route) => {
      const request = route.request()
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules }) })
        return
      }
      if (request.method() === 'DELETE') {
        deleteUrl = request.url()
        rules = []
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
        return
      }
      const body = request.postDataJSON() as Record<string, unknown>
      if (Array.isArray(body.rules)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      } else if (body.id && Object.prototype.hasOwnProperty.call(body, 'signal_type')) {
        updatePatchCount += 1
        editBody = body
        rules = [{ ...existingRule, ...body, action_payload: body.action_payload as Record<string, unknown>, variant_content: 'Edited copy' }]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rule: rules[0] }) })
      } else {
        createBody = body
        const created = { ...body, id: 'rule-created', priority: 1, active: true, created_at: new Date().toISOString() }
        rules = [created]
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.route('**/api/ai/copywriter', async (route) => {
      aiBody = route.request().postDataJSON()
      await aiPending
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, variants: ['A sharper headline for Acme'] }) })
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/rules')
    await page.getByRole('button', { name: 'Edit rule' }).click()
    await page.getByLabel('Action Content URL/Val').fill('Edited copy')
    await page.getByRole('button', { name: 'SAVE CHANGES' }).click()
    await expect.poll(() => editBody).toMatchObject({ id: 'rule-edit', action_type: 'inject_copy', target_selector: '.headline' })
    expect((editBody as unknown as Record<string, unknown>).action_payload).toMatchObject({ content: 'Edited copy', variant_content: 'Edited copy', swaps: [{ selector: '.headline', content: 'Edited copy' }] })
    const updateCountAfterSave = updatePatchCount

    await page.getByRole('button', { name: '✨ AI Copy' }).click()
    await page.getByLabel('Job Title').fill('VP Revenue')
    await page.getByLabel('Industry').fill('SaaS')
    const aiButton = page.getByRole('button', { name: 'GENERATE OPTIONS' })
    await aiButton.click()
    await expect(page.getByRole('button', { name: 'GENERATING CTAs...' })).toBeDisabled()
    aiResolve()
    await expect(page.getByRole('button', { name: 'A sharper headline for Acme' })).toBeVisible()
    await expect.poll(() => aiBody).toEqual({ signal_type: 'Cold Email', job_title: 'VP Revenue', industry: 'SaaS', company_size: '200-500', desired_tone: 'direct' })
    await page.getByRole('button', { name: 'A sharper headline for Acme' }).click()
    await expect(page.getByLabel('Variant Content')).toHaveValue('A sharper headline for Acme')
    expect(updatePatchCount).toBe(updateCountAfterSave)

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'DELETE' }).click()
    await expect.poll(() => deleteUrl).toContain('id=rule-edit')
    await expect(page.getByRole('button', { name: 'Edit rule' })).toHaveCount(0)

    await page.getByRole('button', { name: '+ ADD ROUTING RULE' }).click()
    const createDialog = page.getByRole('dialog', { name: 'Add New Routing Rule' })
    await createDialog.getByLabel('Action Content URL/Val').fill('https://calendar.example.test/team')
    await createDialog.getByRole('button', { name: 'CREATE RULE' }).click()
    await expect.poll(() => createBody).toMatchObject({ signal_type: 'Cold Email', conditions: {}, action_type: 'show_calendar', target_selector: '.sr-target', variant_content: '' })
    expect((createBody as unknown as Record<string, unknown>).action_payload).toMatchObject({ content: 'https://calendar.example.test/team', calendar_url: 'https://calendar.example.test/team' })
  })

  test('Playbook installs preserve failure recovery and embedded compiler behavior', async ({ authenticatedPage: page }) => {
    const standalonePlaybook = { id: 'pb-retry', name: 'Calendar assist', description: 'Synthetic playbook', signal_type: 'cold_email', tier: 1, required_inputs: [{ field_name: 'calendly_url', label: 'Calendar URL', placeholder: 'https://calendar.test', type: 'url' }], rule_template: { signal_type: 'cold_email', action_type: 'show_calendar', action_payload: { calendar_url: '{{ calendly_url }}' }, conditions: {} }, created_at: new Date().toISOString() }
    let installAttempts = 0
    await page.route('**/api/playbooks', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [standalonePlaybook] }) })
    })
    await page.route('**/api/rules**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [] }) })
      } else {
        installAttempts += 1
        if (installAttempts === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic install outage' }) })
        else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/playbooks')
    await page.getByRole('button', { name: 'Install', exact: true }).click()
    await page.getByLabel('Calendar URL').fill('https://calendar.example.test/retry')
    await page.getByRole('button', { name: 'INSTALL PLAYBOOK', exact: true }).click()
    await expect(page.getByText('Synthetic install outage', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Calendar URL')).toHaveValue('https://calendar.example.test/retry')
    await expect(page.getByRole('button', { name: 'INSTALL PLAYBOOK', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'INSTALL PLAYBOOK', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Playbook Installed Successfully')

    let embeddedBody: Record<string, unknown> | null = null
    let embeddedPlaybookCalls = 0
    await page.route('**/api/rules**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [] }) })
      } else {
        embeddedBody = route.request().postDataJSON()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.route('**/api/playbooks', async (route) => {
      embeddedPlaybookCalls += 1
      if (embeddedPlaybookCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic embedded outage' }) })
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [{ id: 'pb-embedded', name: 'CTA assist', description: 'Synthetic embedded playbook', signal_type: 'cold_email', tier: 1, required_inputs: [{ field_name: 'cta_url', label: 'CTA URL', placeholder: 'https://cta.test', type: 'url' }], rule_template: { signal_type: 'cold_email', action_type: 'inject_copy', action_payload: { variant_content: '{{ cta_url }}' }, conditions: {} }, created_at: new Date().toISOString() }] }) })
    })
    await page.goto('/dashboard/rules')
    await page.getByRole('tab', { name: 'Playbook Library' }).click()
    await expect(page.getByRole('alert')).toContainText('Synthetic embedded outage')
    await expect(page.getByText('PLAYBOOK LIBRARY NOTICE', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'TRY AGAIN' }).click()
    await page.getByRole('button', { name: 'Install', exact: true }).click()
    await page.getByLabel('CTA URL').fill('https://cta.example.test/demo')
    await page.getByRole('button', { name: 'INSTALL PLAYBOOK', exact: true }).click()
    await expect.poll(() => embeddedBody).toMatchObject({ signal_type: 'cold_email', action_type: 'inject_copy', conditions: {} })
    expect((embeddedBody as unknown as Record<string, unknown>).action_payload).toMatchObject({ variant_content: 'https://cta.example.test/demo', url: 'https://cta.example.test/demo', cta_url: 'https://cta.example.test/demo' })
    await expect(page.getByRole('status')).toContainText('Playbook Installed Successfully')
    await expect(page.getByRole('button', { name: /View My Rules/i })).toBeVisible()
    await page.getByRole('button', { name: /View My Rules/i }).click()
    await expect(page.getByRole('dialog', { name: 'Install Playbook' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'My Rules' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Playbook Library' })).toHaveAttribute('aria-selected', 'false')
  })

  test('ICP Builder preserves evidence hierarchy and build contract', async ({ authenticatedPage: page }) => {
    let buildMethod = ''
    let buildBody: string | null = null
    await page.route('**/api/icp', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          id: 'icp-1', client_id: 'client-1', win_count: 5, avg_deal_value: 42000, avg_days_to_close: 37,
          icp_summary: 'Revenue leaders at scaling B2B teams with a repeatable sales motion.',
          top_job_titles: [{ title: 'VP Revenue', count: 3 }, { title: 'Head of Growth', count: 2 }],
          top_industries: ['SaaS'], top_deal_stages: [{ sequence: 'Evaluation', count: 2 }], generated_at: new Date().toISOString(),
        }) })
      } else {
        buildMethod = route.request().method()
        buildBody = route.request().postData()
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          icp_profile: { id: 'icp-2', client_id: 'client-1', win_count: 6, avg_deal_value: 50000, avg_days_to_close: 31, icp_summary: 'Updated evidence model.', top_job_titles: [{ title: 'Chief Revenue Officer', count: 4 }], top_industries: null, top_deal_stages: null, generated_at: new Date().toISOString() },
          rules_created: 2,
        }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/icp')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'ICP evidence' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Evidence profile' })).toBeVisible()
    await expect(page.getByText('Win count', { exact: true })).toBeVisible()
    await expect(page.getByText('Avg deal value', { exact: true })).toBeVisible()
    await expect(page.getByText('Avg days to close', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Winning attributes' })).toBeVisible()
    await expect(page.getByText('VP Revenue', { exact: true })).toBeVisible()
    await expect(page.getByText('SaaS', { exact: true })).toBeVisible()
    await expect(page.getByText('Evaluation', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Routing output' })).toBeVisible()
    const buildButton = page.getByRole('button', { name: 'BUILD MY ICP' })
    await buildButton.click()
    await expect.poll(() => buildMethod).toBe('POST')
    expect(buildBody).toBeNull()
    await expect(page.getByText('Updated evidence model.', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('2')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('ICP separates neutral, insufficient, and generic build failures', async ({ authenticatedPage: page }) => {
    let buildCalls = 0
    await page.route('**/api/icp', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) })
      else {
        buildCalls += 1
        await route.fulfill({ status: buildCalls === 1 ? 503 : 400, contentType: 'application/json', body: JSON.stringify({ error: buildCalls === 1 ? 'CRM temporarily unavailable.' : 'Need at least 3 closed-won deals to build ICP' }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/icp')
    await expect(page.getByText('No ICP model yet', { exact: true })).toBeVisible()
    await expect(page.getByText('Not enough closed-won evidence', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'BUILD MY ICP' }).first().click()
    await expect(page.getByRole('alert')).toContainText('CRM temporarily unavailable.')
    await expect(page.getByText('No ICP model yet', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'BUILD MY ICP' }).first()).toBeEnabled()
    await page.getByRole('button', { name: 'BUILD MY ICP' }).first().click()
    await expect(page.getByText('Not enough closed-won evidence', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Need at least 3 closed-won deals to build ICP')
  })

  test('ICP loading is accessible and failed rebuild preserves the current dossier', async ({ authenticatedPage: page }) => {
    let releaseGet!: () => void
    const pendingGet = new Promise<void>((resolve) => { releaseGet = resolve })
    let releasePost!: () => void
    const pendingPost = new Promise<void>((resolve) => { releasePost = resolve })
    let postCalls = 0
    const profile = { id: 'icp-preserve', client_id: 'client-1', win_count: 6, avg_deal_value: 42000, avg_days_to_close: 37, icp_summary: 'Existing evidence remains available.', top_job_titles: [{ title: 'VP Revenue', count: 3 }], top_industries: ['SaaS'], top_deal_stages: [{ sequence: 'Evaluation', count: 2 }], generated_at: new Date().toISOString() }
    await page.route('**/api/icp', async (route) => {
      if (route.request().method() === 'GET') { await pendingGet; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }) }
      else { postCalls += 1; await pendingPost; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'CRM temporarily unavailable.' }) }) }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/icp')
    await expect(page.getByRole('status', { name: 'Loading ICP evidence' })).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('status', { name: 'Loading ICP evidence' })).toHaveClass(/motion-safe:animate-pulse/)
    releaseGet()
    await expect(page.getByText('Existing evidence remains available.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'BUILD MY ICP' }).click()
    await expect.poll(() => postCalls).toBe(1)
    await expect(page.getByRole('button', { name: 'ANALYZING...' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'ANALYZING...' }).locator('svg')).toHaveClass(/motion-safe:animate-spin/)
    releasePost()
    await expect(page.getByRole('alert')).toContainText('CRM temporarily unavailable.')
    await expect(page.getByText('Existing evidence remains available.', { exact: true })).toBeVisible()
    await expect(page.getByText('VP Revenue', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'BUILD MY ICP' })).toBeEnabled()
  })

  test('AI Insights preserves briefing and anomaly contracts', async ({ authenticatedPage: page }) => {
    let digestGenerated = false
    let detectionRun = false
    let digestBody: string | null = null
    let detectionBody: string | null = null
    let markedRead: unknown = null
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/ai/digest', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-1', week_start: '2026-09-14', summary: 'Pipeline momentum is improving.', top_signal: 'Cold Email is converting.', rep_spotlight: 'Asha led the week.', recommendation: 'Route more high-fit accounts to Asha.', created_at: new Date().toISOString() } }) })
      else { digestGenerated = true; digestBody = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-2', week_start: '2026-09-14', summary: 'Generated summary.', top_signal: 'Generated signal.', rep_spotlight: 'Generated rep.', recommendation: 'Generated recommendation.' } }) }) }
    })
    await page.route('**/api/ai/anomaly', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [
        { id: 'alert-critical', alert_text: 'Critical conversion drop.', severity: 'critical', created_at: new Date().toISOString() },
        { id: 'alert-warning', alert_text: 'Warning: stalled pipeline.', severity: 'warning', created_at: new Date().toISOString() },
        { id: 'alert-info', alert_text: 'Info: new signal detected.', severity: 'info', created_at: new Date().toISOString() },
      ] }) })
      else if (route.request().method() === 'POST') { detectionRun = true; detectionBody = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [{ id: 'alert-new', alert_text: 'New detection result.', severity: 'warning', created_at: new Date().toISOString() }] }) }) }
      else { markedRead = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/ai-insights')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Weekly briefing' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Anomaly watch' })).toBeVisible()
    await expect(page.getByText('Pipeline momentum is improving.', { exact: true })).toBeVisible()
    await expect(page.getByText('critical', { exact: true })).toBeVisible()
    await expect(page.getByText('warning', { exact: true })).toBeVisible()
    await expect(page.getByText('info', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => {
      const briefing = document.getElementById('weekly-briefing-heading')
      const anomaly = document.getElementById('anomaly-watch-heading')
      return Boolean(briefing && anomaly && (briefing.compareDocumentPosition(anomaly) & Node.DOCUMENT_POSITION_FOLLOWING))
    })).toBe(true)
    await page.getByRole('button', { name: 'GENERATE DIGEST' }).click()
    await expect.poll(() => digestGenerated).toBe(true)
    expect(digestBody).toBeNull()
    await expect(page.getByText('Generated recommendation.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'RUN DETECTION' }).click()
    await expect.poll(() => detectionRun).toBe(true)
    expect(detectionBody).toBeNull()
    await expect(page.getByText('New detection result.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Mark as Read' }).click()
    await expect.poll(() => markedRead).toEqual({ id: 'alert-new' })
    await expect(page.getByText('New detection result.', { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('AI Insights Starter accounts retain the Growth upgrade gate', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter' } }) }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/ai-insights')
    await expect(page.getByRole('region', { name: 'AI Revenue Insights' })).toBeVisible()
    await expect(page.getByText('Available on the Growth plan', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Upgrade to Growth/i })).toHaveAttribute('href', '/dashboard/billing')
  })

  test('AI Insights waits for plan access and retries digest/anomaly independently', async ({ authenticatedPage: page }) => {
    let releasePlan!: () => void
    const pendingPlan = new Promise<void>((resolve) => { releasePlan = resolve })
    let digestCalls = 0
    let anomalyCalls = 0
    await page.route('**/api/client', async (route) => { await pendingPlan; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/ai/digest', async (route) => {
      digestCalls += 1
      if (digestCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Digest unavailable' }) })
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-retry', week_start: '2026-09-14', summary: 'Recovered digest.', top_signal: 'Recovered signal.', rep_spotlight: 'Recovered rep.', recommendation: 'Recovered recommendation.' } }) })
    })
    await page.route('**/api/ai/anomaly', async (route) => {
      anomalyCalls += 1
      if (anomalyCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Anomaly unavailable' }) })
      else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [{ id: 'retry-alert', alert_text: 'Recovered alert.', severity: 'warning', created_at: new Date().toISOString() }] }) })
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/ai-insights')
    await expect(page.getByRole('status').filter({ hasText: 'Loading workspace access' })).toBeVisible()
    await expect(page.getByText('Available on the Growth plan', { exact: true })).toHaveCount(0)
    releasePlan()
    await expect(page.locator('section[aria-labelledby="weekly-briefing-heading"]').getByRole('alert')).toContainText('Digest unavailable')
    await expect(page.locator('section[aria-labelledby="anomaly-watch-heading"]').getByRole('alert')).toContainText('Anomaly unavailable')
    const briefingSection = page.locator('section[aria-labelledby="weekly-briefing-heading"]')
    const anomalySection = page.locator('section[aria-labelledby="anomaly-watch-heading"]')
    await expect(briefingSection.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()
    await expect(anomalySection.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()
    await briefingSection.getByRole('button', { name: 'TRY AGAIN' }).click()
    await expect(page.getByText('Recovered digest.', { exact: true })).toBeVisible()
    await anomalySection.getByRole('button', { name: 'TRY AGAIN' }).click()
    await expect(page.getByText('Recovered alert.', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('AI Insights preserves content through pending and failed mutations', async ({ authenticatedPage: page }) => {
    let digestPostCalls = 0
    let anomalyPostCalls = 0
    let patchCalls = 0
    let releaseDigest!: () => void
    let releaseAnomaly!: () => void
    const pendingDigest = new Promise<void>((resolve) => { releaseDigest = resolve })
    const pendingAnomaly = new Promise<void>((resolve) => { releaseAnomaly = resolve })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/ai/digest', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-base', week_start: '2026-09-14', summary: 'Base briefing remains.', top_signal: 'Base signal.', rep_spotlight: 'Base rep.', recommendation: 'Base recommendation.' } }) })
      else {
        digestPostCalls += 1
        expect(route.request().postData()).toBeNull()
        if (digestPostCalls === 1) { await pendingDigest; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-new', week_start: '2026-09-14', summary: 'Fresh briefing.', top_signal: 'Fresh signal.', rep_spotlight: 'Fresh rep.', recommendation: 'Fresh recommendation.' } }) }) }
        else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Digest generation failed.' }) })
      }
    })
    await page.route('**/api/ai/anomaly', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [{ id: 'alert-one', alert_text: 'First alert remains.', severity: 'warning', created_at: new Date().toISOString() }, { id: 'alert-two', alert_text: 'Second alert remains.', severity: 'info', created_at: new Date().toISOString() }] }) })
      else if (route.request().method() === 'POST') {
        anomalyPostCalls += 1
        expect(route.request().postData()).toBeNull()
        if (anomalyPostCalls === 1) { await pendingAnomaly; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [{ id: 'alert-new', alert_text: 'Fresh alert.', severity: 'critical', created_at: new Date().toISOString() }, { id: 'alert-peer', alert_text: 'Peer alert remains.', severity: 'info', created_at: new Date().toISOString() }] }) }) }
        else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Detection failed.' }) })
      } else {
        patchCalls += 1
        expect(route.request().postDataJSON()).toEqual({ id: 'alert-new' })
        await route.fulfill({ status: patchCalls === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(patchCalls === 1 ? { error: 'Mark failed.' } : { success: true }) })
      }
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/ai-insights')
    await expect(page.getByText('Base briefing remains.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'GENERATE DIGEST' }).click()
    await expect(page.getByRole('button', { name: 'COMPILING...' })).toBeDisabled()
    releaseDigest()
    await expect(page.getByText('Fresh briefing.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'RUN DETECTION' }).click()
    await expect(page.getByRole('button', { name: 'SCANNING...' })).toBeDisabled()
    releaseAnomaly()
    await expect(page.getByText('Fresh alert.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'GENERATE DIGEST' }).click()
    await expect(page.getByRole('alert')).toContainText('Digest generation failed.')
    await expect(page.getByText('Fresh briefing.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'RUN DETECTION' }).click()
    await expect(page.getByRole('alert')).toContainText('Detection failed.')
    await expect(page.getByText('Fresh alert.', { exact: true })).toBeVisible()
    const freshAlert = page.locator('li').filter({ hasText: 'Fresh alert.' })
    await freshAlert.getByRole('button', { name: 'Mark as Read' }).click()
    await expect(page.getByText('Fresh alert.', { exact: true })).toBeVisible()
    await freshAlert.getByRole('button', { name: 'Mark as Read' }).click()
    await expect(page.getByText('Fresh alert.', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Peer alert remains.', { exact: true })).toBeVisible()
  })

  test('Integrations connection map preserves status, gating, and disclosure semantics', async ({ authenticatedPage: page }) => {
    await page.route('**/api/oauth/crm', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true, crm_type: 'hubspot' }) }) })
    await page.route('**/api/oauth/calendly/status', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, connected_at: null }) }) })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'starter' } }) }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/integrations')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByText('Connection map', { exact: true })).toBeVisible()
    await expect(page.getByText('Event sources', { exact: true })).toBeVisible()
    await expect(page.getByText('Calendly and workflow tools', { exact: true })).toBeVisible()
    await expect(page.getByText('HubSpot', { exact: true })).toBeVisible()
    await expect(page.getByText('Growth Plan', { exact: true })).toBeVisible()
    const trigger = page.getByRole('button', { name: 'Expected Payload Fields' }).first()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const panelId = await trigger.getAttribute('aria-controls')
    await trigger.focus(); await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`#${panelId}`)).toHaveAttribute('role', 'region')
    await trigger.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Integrations connection map reports a disconnected HubSpot accurately', async ({ authenticatedPage: page }) => {
    await page.route('**/api/oauth/crm', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, crm_type: null }) }) })
    await page.route('**/api/oauth/calendly/status', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false, connected_at: null }) }) })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/integrations')
    const hubspotCard = page.getByRole('heading', { name: 'HubSpot' }).locator('..')
    await expect(hubspotCard.getByText('Disconnected', { exact: true })).toBeVisible()
    await expect(hubspotCard.getByText('Connected', { exact: true })).toHaveCount(0)
  })

  test('Connection fabric does not guess unavailable status or plan access', async ({ authenticatedPage: page }) => {
    await page.route('**/api/oauth/crm', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.route('**/api/oauth/calendly/status', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.goto('/dashboard/integrations')
    const hubspotCard = page.getByRole('heading', { name: 'HubSpot' }).locator('..')
    await expect(hubspotCard.getByText('Status unavailable', { exact: true })).toBeVisible()
    await expect(page.getByText('Growth Plan', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Webhook Only', { exact: true })).toHaveCount(3)
    await page.goto('/dashboard/integrations/crm')
    await expect(page.getByText('Status unavailable', { exact: true })).toBeVisible()
    await expect(page.getByText('Disconnected', { exact: true })).toHaveCount(0)
  })

  test('HubSpot and Calendly hide actions until status resolves and expose retry on failure', async ({ authenticatedPage: page }) => {
    let releaseHubspot!: () => void
    const hubspotPending = new Promise<void>((resolve) => { releaseHubspot = resolve })
    await page.route('**/api/oauth/crm', async (route) => { await hubspotPending; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.goto('/dashboard/integrations/crm/hubspot')
    await expect(page.getByRole('button', { name: 'CONNECT HUBSPOT' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'DISCONNECT HUBSPOT' })).toHaveCount(0)
    releaseHubspot()
    await expect(page.getByText('Status unavailable', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()

    let releaseCalendly!: () => void
    const calendlyPending = new Promise<void>((resolve) => { releaseCalendly = resolve })
    await page.route('**/api/oauth/calendly/status', async (route) => { await calendlyPending; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.goto('/dashboard/integrations/calendly')
    await expect(page.getByRole('link', { name: 'CONNECT CALENDLY' })).toHaveCount(0)
    releaseCalendly()
    await expect(page.getByText('Status unavailable', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()
  })

  test('Webhook workstation preserves auth, mapping, and log contracts', async ({ authenticatedPage: page }) => {
    let rotateMethod = ''; let rotateBody: string | null = null; let mappingBody: unknown = null; let deleteUrl = ''
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { webhook_secret: 'secret-one', webhook_query_auth_expires_at: '2026-10-20T00:00:00.000Z', webhook_previous_secret_expires_at: null } }) }) })
    await page.route('**/api/webhook/mappings', async (route) => { if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mappings: [] }) }); else { mappingBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mapping: { id: 'mapping-1', external_field: 'email', internal_field: 'prospect_name' } }) }) } })
    await page.route('**/api/webhook/mappings?id=*', async (route) => { deleteUrl = route.request().url(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) })
    await page.route('**/api/webhook/logs', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [{ id: 'log-1', created_at: new Date().toISOString(), session_id: 'session-1', metadata: { webhook_action: 'processed', webhook_auth_method: 'bearer', payload_key_count: 2, transformed_field_count: 1, result_category: 'success' } }] }) }) })
    await page.route('**/api/webhook/secret/rotate', async (route) => { rotateMethod = route.request().method(); rotateBody = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ webhook_secret: 'secret-two', previous_secret_expires_at: null }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/integrations/webhooks')
    await expect(page.getByLabel('Webhook URL')).toHaveValue(/\/api\/webhook$/)
    await expect(page.getByLabel('Webhook URL')).not.toHaveValue(/client_key=/)
    await expect(page.getByText('Legacy URL', { exact: true })).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'ROTATE WEBHOOK SECRET' }).click()
    await expect.poll(() => rotateMethod).toBe('POST'); expect(rotateBody).toBeNull(); await expect(page.getByLabel('Authorization Bearer Token (Recommended)')).toHaveValue('secret-two')
    const select = page.getByRole('combobox', { name: 'Map Prospect Name' }); await select.selectOption('email'); await page.getByRole('button', { name: 'Map selected field to Prospect Name' }).click(); await expect.poll(() => mappingBody).toEqual({ external_field: 'email', internal_field: 'prospect_name' })
    await expect(page.getByText('email', { exact: true }).last()).toBeVisible(); await page.getByRole('button', { name: 'Remove mapping for Prospect Name' }).click(); await expect.poll(() => deleteUrl).toContain('id=mapping-1')
    const log = page.locator('button[aria-controls^="webhook-log-"]').first(); await log.focus(); await page.keyboard.press('Enter'); await expect(page.locator('#webhook-log-log-1')).toBeVisible(); await expect(page.getByText('Bearer', { exact: true })).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Webhook workstation separates credential, mapping, and log failures', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'client unavailable' }) }) })
    await page.route('**/api/webhook/mappings', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'mapping unavailable' }) }) })
    await page.route('**/api/webhook/logs', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'logs unavailable' }) }) })
    await page.goto('/dashboard/integrations/webhooks')
    await expect(page.getByRole('alert').filter({ hasText: 'Webhook credentials unavailable.' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Field mappings unavailable.' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Webhook logs unavailable.' })).toBeVisible()
    await expect(page.getByLabel('Authorization Bearer Token (Recommended)')).toHaveCount(0)
  })

  test('Webhook mapper keeps selections independent per target', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { webhook_secret: 'secret-one' } }) }) })
    await page.route('**/api/webhook/mappings', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mappings: [] }) }) })
    await page.route('**/api/webhook/logs', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [] }) }) })
    await page.goto('/dashboard/integrations/webhooks')
    const name = page.getByRole('combobox', { name: 'Map Prospect Name' })
    const company = page.getByRole('combobox', { name: 'Map Company Name' })
    await name.selectOption('email')
    await company.selectOption('company')
    await expect(name).toHaveValue('email')
    await expect(company).toHaveValue('company')
  })

  test('Connection detail routes retain OAuth and disconnect contracts', async ({ authenticatedPage: page }) => {
    let crmDeleteMethod = ''; let crmDeleteBody: string | null = null; let calendlyDeleteMethod = ''; let calendlyDeleteBody: string | null = null
    await page.route('**/api/oauth/crm', async (route) => { if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true, crm_type: 'hubspot', connected_at: '2026-09-18T10:00:00.000Z' }) }); else { crmDeleteMethod = route.request().method(); crmDeleteBody = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) } })
    await page.route('**/api/oauth/calendly/status', async (route) => { if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true, connected_at: '2026-09-18T10:00:00.000Z' }) }); else { calendlyDeleteMethod = route.request().method(); calendlyDeleteBody = route.request().postData(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) } })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/integrations/crm/hubspot'); await expect(page.locator('h1')).toHaveCount(1); await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: /CRM DIRECTORY/i })).toHaveAttribute('href', '/dashboard/integrations/crm'); page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'DISCONNECT HUBSPOT' }).click(); await expect.poll(() => crmDeleteMethod).toBe('DELETE'); expect(crmDeleteBody).toBeNull(); await expect(page.getByText('DISCONNECTED', { exact: true })).toBeVisible()
    await page.goto('/dashboard/integrations/calendly'); await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible(); page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'DISCONNECT CALENDLY' }).click(); await expect.poll(() => calendlyDeleteMethod).toBe('DELETE'); expect(calendlyDeleteBody).toBeNull(); await expect(page.getByText('DISCONNECTED', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'CONNECT CALENDLY' })).toHaveAttribute('href', '/api/oauth/calendly');
    await page.goto('/dashboard/integrations/crm'); await expect(page.locator('h1')).toHaveCount(1); for (const provider of ['Pipedrive', 'Zoho CRM', 'Close', 'Salesforce', 'Attio']) await expect(page.getByRole('heading', { name: provider, exact: true })).toBeVisible(); expect(await page.locator('a a').count()).toBe(0); await expect(page.getByRole('button', { name: 'CONNECT →' })).toHaveCount(2); await expect(page.getByRole('button', { name: 'CONNECT →' }).nth(0)).toBeDisabled(); await expect(page.getByRole('button', { name: 'CONNECT →' }).nth(1)).toBeDisabled(); await expect(page.getByText('Coming Soon', { exact: true })).toHaveCount(2);
    for (const route of ['/dashboard/integrations/crm/pipedrive', '/dashboard/integrations/crm/zoho', '/dashboard/integrations/crm/close', '/dashboard/integrations/crm/salesforce', '/dashboard/integrations/crm/attio']) { await page.goto(route); await expect(page.locator('h1')).toHaveCount(1); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) }
    await page.goto('/dashboard/integrations/crm/salesforce'); await expect(page.getByText('Coming Soon', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'CONNECT SALESFORCE CRM →' })).toBeDisabled(); await page.goto('/dashboard/integrations/crm/attio'); await expect(page.getByText('Coming Soon', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'CONNECT ATTIO →' })).toBeDisabled(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Webhook-only CRM detail routes never offer a fake OAuth connection', async ({ authenticatedPage: page }) => {
    for (const [route, provider] of [['/dashboard/integrations/crm/pipedrive', 'Pipedrive CRM'], ['/dashboard/integrations/crm/zoho', 'Zoho CRM'], ['/dashboard/integrations/crm/close', 'Close CRM']] as const) {
      await page.goto(route)
      await expect(page.getByRole('heading', { name: provider, exact: true })).toBeVisible()
      await expect(page.getByText('WEBHOOK ONLY', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /CONFIGURE WEBHOOKS/i })).toHaveAttribute('href', '/dashboard/integrations/webhooks')
      await expect(page.locator('a[href^="/api/oauth/"]')).toHaveCount(0)
    }
  })

  test('Snippet deployment preserves runtime and verification contracts', async ({ authenticatedPage: page }) => {
    let statusRequests = 0
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { snippet_key: 'fixture-client-key' } }) }) })
    await page.route('**/api/snippet-status', async (route) => { statusRequests += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: true, lastPing: '2026-09-18T10:00:00.000Z' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/snippet'); await expect(page.locator('h1')).toHaveCount(1)
    for (const heading of ['Install runtime', 'Mark target elements', 'Verify connection', 'Platform guides']) await expect(page.getByText(new RegExp(`\\d · ${heading}`))).toBeVisible()
    await expect(page.locator('pre').first()).toContainText('window.SR_CLIENT_ID = \'fixture-client-key\''); await expect(page.locator('pre').first()).toContainText('https://cdn.churnaut.com/snippet.js'); await page.getByRole('button', { name: 'CHECK STATUS' }).click(); await expect.poll(() => statusRequests).toBe(1); await expect(page.getByRole('status')).toContainText('CONNECTION CONFIRMED'); await expect(page.getByRole('button', { name: 'Webflow Setup' })).toHaveAttribute('aria-controls', 'snippet-guide-webflow'); await page.getByRole('button', { name: 'Webflow Setup' }).press('Enter'); await expect(page.locator('#snippet-guide-webflow')).toHaveAttribute('role', 'region'); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Snippet keeps the last verified state visible after a failed re-check', async ({ authenticatedPage: page }) => {
    let statusRequests = 0
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { snippet_key: 'fixture-client-key' } }) }) })
    await page.route('**/api/snippet-status', async (route) => { statusRequests += 1; await route.fulfill({ status: statusRequests === 1 ? 200 : 503, contentType: 'application/json', body: JSON.stringify(statusRequests === 1 ? { active: true } : { error: 'unavailable' }) }) })
    await page.goto('/dashboard/snippet')
    await page.getByRole('button', { name: 'CHECK STATUS' }).click()
    await expect(page.getByText('CONNECTION CONFIRMED', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'CHECK STATUS' }).click()
    await expect(page.getByRole('alert')).toContainText('Status unavailable')
    await expect(page.getByText('CONNECTION CONFIRMED', { exact: true })).toBeVisible()
  })

  test('mobile navigation behaves like an accessible sheet', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    const trigger = page.getByRole('button', { name: 'Open navigation' })
    await expect(trigger).toHaveAttribute('aria-controls', 'mobile-navigation')
    await trigger.click()
    const navigation = page.getByRole('dialog', { name: 'Primary navigation' })
    await expect(navigation).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    for (const group of ['OBSERVE', 'ACTIVATE', 'INTELLIGENCE', 'CONNECT', 'WORKSPACE']) await expect(navigation.getByText(group, { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(navigation).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
    await page.goto('/dashboard/links')
    await trigger.click()
    await expect(page.getByRole('link', { name: 'Churnaut' })).toBeVisible()
    await page.getByRole('link', { name: 'Churnaut' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('dialog', { name: 'Primary navigation' })).toHaveCount(0)
    await expect(page.locator('main')).not.toHaveAttribute('inert', '')
    await expect.poll(() => page.locator('body').evaluate((body) => body.style.overflow)).toBe('')
  })

  test('command palette traps focus and closes with Escape under reduced motion', async ({ authenticatedPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Search workspace' }).click()
    const palette = page.getByRole('dialog', { name: 'Search workspace' })
    await expect(palette).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search workspace' })).toBeFocused()
    await page.getByRole('textbox', { name: 'Search workspace' }).fill('playbook')
    const playbookResult = page.getByRole('button', { name: /Playbook Library.*Activate/i })
    await expect(playbookResult).toBeVisible()
    await playbookResult.click()
    await expect(page).toHaveURL(/\/dashboard\/playbooks$/)
    await expect(page.getByRole('dialog', { name: 'Search workspace' })).toHaveCount(0)
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Search workspace' }).click()
    await expect(page.getByRole('textbox', { name: 'Search workspace' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('priority dashboard routes stay usable at phone width', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    for (const route of ['/dashboard', '/dashboard/analytics', '/dashboard/links', '/dashboard/rules', '/dashboard/scout', '/dashboard/icp', '/dashboard/ai-insights', '/dashboard/integrations', '/dashboard/integrations/crm', '/dashboard/integrations/crm/hubspot', '/dashboard/integrations/crm/pipedrive', '/dashboard/integrations/crm/zoho', '/dashboard/integrations/crm/close', '/dashboard/integrations/crm/salesforce', '/dashboard/integrations/crm/attio', '/dashboard/integrations/calendly', '/dashboard/integrations/webhooks', '/dashboard/onboarding', '/dashboard/playbooks', '/dashboard/snippet', '/dashboard/settings', '/dashboard/billing', '/dashboard/support']) {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.locator('h1')).toHaveCount(1)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })

  test('representative routes keep one page heading and semantic controls', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    for (const route of ['/dashboard/onboarding', '/dashboard/playbooks']) {
      await page.goto(route)
      await expect(page.locator('h1')).toHaveCount(1)
    }
    await page.goto('/dashboard/billing')
    await expect(page.getByRole('switch', { name: /monthly and yearly/i })).toBeVisible()
    await page.goto('/dashboard/snippet')
    const guide = page.locator('button[aria-controls^="snippet-guide-"]').first()
    await expect(guide).toBeVisible()
    const expanded = await guide.getAttribute('aria-expanded')
    await guide.click()
    await expect(guide).not.toHaveAttribute('aria-expanded', expanded || '')
    await page.goto('/dashboard/integrations/webhooks')
    await expect(page.getByRole('combobox', { name: /map /i }).first()).toBeVisible()
  })

  test('interactive disclosure and creation controls expose semantics when present', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/scout')
    const disclosure = page.locator('button[aria-controls^="scout-"]').first()
    await expect(disclosure).toBeVisible()
    const before = await disclosure.getAttribute('aria-expanded')
    await disclosure.click()
    await expect(disclosure).not.toHaveAttribute('aria-expanded', before || '')
    await page.goto('/dashboard/links')
    const create = page.getByRole('button', { name: '+ NEW LINK', exact: true })
    await expect(create).toBeVisible()
    await create.click()
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' }).getByRole('tab').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' })).toHaveCount(0)
    await expect(create).toBeFocused()
  })

  test('Rules mobile editor traps focus and desktop keeps inspector non-modal', async ({ authenticatedPage: page }) => {
    const rule = { id: 'e2e-rule', priority: 1, active: true, signal_type: 'Cold Email', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.com' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() }
    await page.route('**/api/rules*', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [rule] }) })
      else await route.continue()
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/rules')
    const edit = page.getByRole('button', { name: 'Edit rule', exact: true })
    await expect(edit).toBeVisible()
    await edit.click()
    const dialog = page.locator('#rule-editor-dialog[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('input,select,textarea,button').first()).toBeFocused()
    await dialog.locator('button').first().focus()
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#rule-editor-dialog') !== null)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(edit).toBeFocused()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard/rules')
    await page.getByRole('button', { name: 'Edit rule', exact: true }).click()
    await expect(page.locator('#rule-editor-dialog')).toBeVisible()
    await expect(page.locator('#rule-editor-dialog[role="dialog"]')).toHaveCount(0)
  })

  test('Billing switch changes state and webhook log disclosure is keyboard-operable', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard/billing')
    const billingSwitch = page.getByRole('switch', { name: /monthly and yearly/i })
    await expect(billingSwitch).toBeVisible()
    const initial = await billingSwitch.getAttribute('aria-checked')
    await billingSwitch.click()
    await expect(billingSwitch).toHaveAttribute('aria-checked', initial === 'true' ? 'false' : 'true')

    await page.route('**/api/webhook/logs*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [{ id: 'e2e-log', created_at: new Date().toISOString(), session_id: 'session', metadata: { webhook_action: 'processed', webhook_auth_method: 'bearer', payload_key_count: 1, transformed_field_count: 1, result_category: 'success' } }] }) })
    })
    await page.goto('/dashboard/integrations/webhooks')
    const logButton = page.locator('button[aria-controls^="webhook-log-"]').first()
    await expect(logButton).toBeVisible()
    await expect(logButton).toHaveAttribute('aria-expanded', 'false')
    await logButton.focus()
    await page.keyboard.press('Enter')
    await expect(logButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#webhook-log-e2e-log')).toBeVisible()
  })

  test('Onboarding preserves five-step state and generation contract', async ({ authenticatedPage: page }) => {
    let onboardingBody: Record<string, unknown> | null = null
    await page.route('**/api/ai/onboarding', async (route) => { onboardingBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/onboarding')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByText('Step 1 of 5', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'None', exact: true }).click()
    await expect(page.getByRole('button', { name: 'None', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await expect(page.getByRole('progressbar', { name: 'Step 2 of 5' })).toHaveAttribute('aria-valuenow', '40')
    await page.getByLabel('Ideal customer profile').fill('B2B SaaS teams with a growing sales pipeline')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: '200-500 employees', exact: true }).click()
    await expect(page.getByRole('button', { name: '200-500 employees', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'Cold Email', exact: true }).click()
    await page.getByRole('button', { name: 'LinkedIn Outreach', exact: true }).click()
    await expect(page.getByRole('button', { name: 'LinkedIn Outreach', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'High-intent buyers not getting fast response', exact: true }).click()
    await page.getByRole('button', { name: 'COMPLETE SETUP', exact: true }).click()
    await expect.poll(() => onboardingBody).toEqual({ crm: 'None', ideal_customer: 'B2B SaaS teams with a growing sales pipeline', company_size: '200-500', channels: ['Cold Email', 'LinkedIn Outreach'], problem: 'High-intent buyers not getting fast response' })
    await expect(page).toHaveURL(/\/dashboard\/rules$/)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Snippet deployment fails closed when client configuration is unavailable', async ({ authenticatedPage: page }) => {
    let statusRequests = 0
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.route('**/api/snippet-status', async (route) => { statusRequests += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: true }) }) })
    await page.goto('/dashboard/snippet')
    await expect(page.getByRole('alert')).toContainText('Snippet configuration unavailable.')
    await expect(page.getByText('CLIENT_UNIQUE_KEY_HERE', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'CHECK STATUS' })).toHaveCount(0)
    expect(statusRequests).toBe(0)
  })

  test('Onboarding presents a staged rail and preserves a degraded retry state', async ({ authenticatedPage: page }) => {
    let generationCalls = 0
    let releaseGeneration!: () => void
    const pendingGeneration = new Promise<void>((resolve) => { releaseGeneration = resolve })
    await page.route('**/api/ai/onboarding', async (route) => {
      generationCalls += 1
      if (generationCalls === 1) {
        await pendingGeneration
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, degraded: true, error: 'AI setup is temporarily unavailable.' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard/onboarding')
    await expect(page.getByRole('list', { name: 'Onboarding steps' })).toBeVisible()
    await expect(page.getByText('Step 1 of 5', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'HubSpot', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByLabel('Ideal customer profile').fill('B2B SaaS teams')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'COMPLETE SETUP', exact: true }).click()
    await expect(page.locator('[aria-busy="true"]')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Generating personalized routing rules')
    releaseGeneration()
    await expect(page.getByRole('alert')).toContainText('AI setup is temporarily unavailable.')
    await expect(page.getByRole('button', { name: 'COMPLETE SETUP', exact: true })).toBeEnabled()
    await expect(page).toHaveURL(/\/dashboard\/onboarding$/)

    // A degraded AI response must not discard any of the answers collected before it.
    await expect(page.getByRole('button', { name: 'High-intent buyers not getting fast response', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'BACK', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cold Email', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'BACK', exact: true }).click()
    await expect(page.getByRole('button', { name: '50-200 employees', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'BACK', exact: true }).click()
    await expect(page.getByLabel('Ideal customer profile')).toHaveValue('B2B SaaS teams')
    await page.getByRole('button', { name: 'BACK', exact: true }).click()
    await expect(page.getByRole('button', { name: 'HubSpot', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // Return to the final step and prove a subsequent successful attempt still completes setup.
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'COMPLETE SETUP', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/rules$/)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Playbook library preserves template compilation and install contract', async ({ authenticatedPage: page }) => {
    let ruleBody: Record<string, unknown> | null = null
    const playbook = { id: 'pb-e2e', name: 'Calendar assist', description: 'Synthetic playbook', signal_type: 'cold_email', tier: 1, required_inputs: [{ field_name: 'calendly_url', label: 'Calendar URL', placeholder: 'https://calendar.test', type: 'url' }], rule_template: { signal_type: 'cold_email', action_type: 'show_calendar', action_payload: { calendar_url: '{{ calendly_url }}' }, conditions: {} }, created_at: new Date().toISOString() }
    await page.route('**/api/playbooks', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [playbook] }) }) })
    await page.route('**/api/rules', async (route) => { ruleBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/playbooks')
    await page.getByRole('button', { name: 'Install', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Install Playbook' })).toBeVisible()
    await page.getByLabel('Calendar URL').fill('https://calendar.example.test/demo'); await page.getByRole('button', { name: 'INSTALL PLAYBOOK', exact: true }).click()
    await expect.poll(() => ruleBody).toMatchObject({ signal_type: 'cold_email', action_type: 'show_calendar', action_payload: { calendar_url: 'https://calendar.example.test/demo', calendly_url: 'https://calendar.example.test/demo' } }); await expect(page.getByRole('status')).toContainText('Playbook Installed Successfully'); await expect(page.getByRole('link', { name: /View Routing Rules/i })).toHaveAttribute('href', '/dashboard/rules')
    await page.route('**/api/playbooks', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [], warning: 'Table not seeded yet' }) }) }); await page.goto('/dashboard/playbooks'); await expect(page.getByText('Table not seeded yet', { exact: false })).toBeVisible(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Settings preserves domain mutation contracts', async ({ authenticatedPage: page }) => {
    let patchBody: unknown = null; let addBody: unknown = null; let deleteUrl = ''
    const domains = [{ id: 'domain-1', origin: 'https://one.example', domain: 'one.example', is_primary: true, active: true }, { id: 'domain-2', origin: 'https://two.example', domain: 'two.example', is_primary: false, active: true }]
    await page.route('**/api/client', async (route) => { if (route.request().method() === 'PATCH') { patchBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, domain: 'https://two.example' }) }) } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { company_name: 'Synthetic Co', domain: 'https://one.example', plan: 'growth', monthly_visits: 3200 } }) }) })
    await page.route('**/api/client/domains**', async (route) => { if (route.request().method() === 'POST') { addBody = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domain: { id: 'domain-3', origin: 'https://three.example', domain: 'three.example', is_primary: false, active: true } }) }) } else if (route.request().method() === 'DELETE') { deleteUrl = route.request().url(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/settings'); await expect(page.getByRole('group', { name: 'Registered domains' })).toBeVisible(); await expect(page.getByText('Growth', { exact: true })).toBeVisible(); await page.getByRole('radio', { name: 'Make https://two.example primary' }).check(); await page.getByRole('button', { name: 'Save Primary Domain' }).click(); await expect.poll(() => patchBody).toEqual({ domain: 'https://two.example' }); await expect(page.getByRole('status')).toContainText('updated')
    await page.getByLabel('Add a domain').fill('https://three.example'); await page.getByRole('button', { name: 'Add', exact: true }).click(); await expect.poll(() => addBody).toEqual({ domain: 'https://three.example' }); await page.getByRole('button', { name: 'Remove' }).last().click(); await expect.poll(() => deleteUrl).toContain('id=domain-2'); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Settings does not invent workspace or domain facts during independent failures', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.route('**/api/client/domains**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains: [] }) }) })
    await page.goto('/dashboard/settings')
    await expect(page.getByRole('alert').filter({ hasText: 'Workspace profile unavailable.' })).toBeVisible()
    await expect(page.getByText('Starter', { exact: true })).toHaveCount(0)

    await page.unroute('**/api/client')
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { company_name: 'Synthetic Co', plan: 'growth', monthly_visits: 10 } }) }) })
    await page.unroute('**/api/client/domains**')
    await page.route('**/api/client/domains**', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: 'Domain registry unavailable.' })).toBeVisible()
    await expect(page.getByText('No domains registered yet.', { exact: true })).toHaveCount(0)
  })

  test('Settings preserves persisted domains through failed mutations and recovers independently', async ({ authenticatedPage: page }) => {
    let patchBody: unknown = null; let addCalls = 0; let releaseAdd!: () => void
    const pendingAdd = new Promise<void>((resolve) => { releaseAdd = resolve })
    const domains = [{ id: 'domain-1', origin: 'https://one.example', domain: 'one.example', is_primary: true, active: true }, { id: 'domain-2', origin: 'https://two.example', domain: 'two.example', is_primary: false, active: true }]
    let clientCalls = 0
    await page.route('**/api/client', async (route) => { if (route.request().method() === 'PATCH') { patchBody = route.request().postDataJSON(); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'save failed' }) }); return } clientCalls += 1; if (clientCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }); else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { company_name: 'Synthetic Co', domain: 'https://one.example', plan: 'growth', monthly_visits: 10 } }) }) })
    await page.route('**/api/client/domains**', async (route) => { if (route.request().method() === 'POST') { addCalls += 1; await pendingAdd; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Domain limit reached for your plan' }) }); } else if (route.request().method() === 'DELETE') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'delete failed' }) }); else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains }) }) })
    await page.goto('/dashboard/settings')
    await expect(page.getByRole('alert').filter({ hasText: 'Workspace profile unavailable.' })).toBeVisible(); await page.getByRole('button', { name: 'TRY AGAIN' }).first().click(); await expect(page.getByText('Synthetic Co', { exact: true })).toBeVisible()
    await page.getByRole('radio', { name: 'Make https://two.example primary' }).check(); await page.getByRole('button', { name: 'Save Primary Domain' }).click(); await expect.poll(() => patchBody).toEqual({ domain: 'https://two.example' }); await expect(page.getByRole('radio', { name: 'Make https://one.example primary' })).toBeChecked()
    const input = page.getByLabel('Add a domain'); await input.fill('https://three.example'); const add = page.getByRole('button', { name: 'Add', exact: true }); await add.click(); await expect(add).toBeDisabled(); await add.click({ force: true }).catch(() => {}); expect(addCalls).toBe(1); releaseAdd(); await expect(page.getByRole('alert')).toContainText('Domain limit reached for your plan'); await expect(input).toHaveValue('https://three.example')
    await page.getByRole('button', { name: 'Remove' }).last().click(); await expect(page.getByRole('alert')).toContainText('delete failed'); await expect(page.getByText('https://two.example', { exact: true })).toBeVisible()
  })

  test('Settings enforces confirmed Starter, Growth, and Pro domain capacities', async ({ authenticatedPage: page }) => {
    let currentPlan = 'starter'
    const limits = { starter: 1, growth: 3, pro: 10 } as const
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { company_name: 'Synthetic Co', plan: currentPlan, monthly_visits: 0 } }) }) })
    await page.route('**/api/client/domains**', async (route) => { const domains = Array.from({ length: limits[currentPlan as keyof typeof limits] }, (_, index) => ({ id: `domain-${index}`, origin: `https://domain-${index}.example`, domain: `domain-${index}.example`, is_primary: index === 0, active: true })); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains }) }) })
    for (const plan of ['starter', 'growth', 'pro'] as const) { currentPlan = plan; await page.goto('/dashboard/settings'); await expect(page.getByText(plan[0].toUpperCase() + plan.slice(1), { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled() }
  })

  test('Billing preserves cycle, pricing, and checkout wiring', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { id: 'client-e2e', plan: 'growth', plan_status: 'active', monthly_visits: 1200 } }) }) }); await page.route('**/api/billing/portal', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://billing.example.test/portal' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/billing'); await expect(page.locator('h1')).toHaveCount(1); await expect(page.getByText('Monthly Tracked Visits — Growth Plan', { exact: true })).toBeVisible(); await expect(page.getByText('Current Plan', { exact: true })).toBeVisible(); const billingSwitch = page.getByRole('switch', { name: /monthly and yearly/i }); await expect(billingSwitch).toHaveAttribute('aria-checked', 'false'); const monthlyHref = await page.getByRole('link', { name: 'Upgrade to Pro →' }).getAttribute('href'); expect(monthlyHref).toContain(`/buy/${PLAN_PRICING.pro.monthlyVariantId}`); expect(monthlyHref).toContain('checkout%5Bcustom%5D%5Bclient_id%5D=client-e2e'); await billingSwitch.click(); await expect(billingSwitch).toHaveAttribute('aria-checked', 'true'); await expect(page.getByText(/Billed \$[\d,]+\/yr/).first()).toBeVisible(); const yearlyHref = await page.getByRole('link', { name: 'Upgrade to Pro →' }).getAttribute('href'); expect(yearlyHref).toContain(`/buy/${PLAN_PRICING.pro.yearlyVariantId}`); expect(yearlyHref).toContain('checkout%5Bcustom%5D%5Bclient_id%5D=client-e2e'); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Billing fails closed when the account cannot be verified', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.goto('/dashboard/billing')
    await expect(page.getByRole('alert')).toContainText('Billing account unavailable.')
    await expect(page.getByText('Current Plan', { exact: true })).toHaveCount(0)
  })

  test('Billing never exposes a generic portal when the verified portal lookup fails', async ({ authenticatedPage: page }) => {
    let releasePortal!: () => void
    const pendingPortal = new Promise<void>((resolve) => { releasePortal = resolve })
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { id: 'client-e2e', plan: 'growth', plan_status: 'active', monthly_visits: 1200 } }) }) })
    await page.route('**/api/billing/portal', async (route) => { await pendingPortal; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }) })
    await page.goto('/dashboard/billing')
    await expect(page.getByText('Loading billing portal…', { exact: true })).toBeVisible()
    await expect(page.locator('a[href="https://churnaut.lemonsqueezy.com/billing"]')).toHaveCount(0)
    releasePortal()
    await expect(page.getByRole('alert')).toContainText('Billing portal unavailable.')
    await expect(page.locator('a[href="https://churnaut.lemonsqueezy.com/billing"]')).toHaveCount(0)
    await expect(page.getByText('Upgrade to Pro →', { exact: true })).toBeVisible()
  })

  test('Billing exposes an accessible account loading state before verification', async ({ authenticatedPage: page }) => {
    let releaseClient!: () => void
    const pendingClient = new Promise<void>((resolve) => { releaseClient = resolve })
    await page.route('**/api/client', async (route) => { await pendingClient; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { id: 'client-e2e', plan: 'growth', plan_status: 'active', monthly_visits: 1200 } }) }) })
    await page.goto('/dashboard/billing')
    await expect(page.getByRole('status', { name: 'Loading billing account' })).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText('Current Plan', { exact: true })).toHaveCount(0)
    releaseClient()
    await expect(page.getByText('Current Plan', { exact: true })).toBeVisible()
  })

  test('Billing account recovery and valid portal responses remain truthful', async ({ authenticatedPage: page }) => {
    let clientCalls = 0
    await page.route('**/api/client', async (route) => { clientCalls += 1; if (clientCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }); else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { id: 'client-e2e', plan: 'growth', plan_status: 'past_due', monthly_visits: 1200 } }) }) })
    await page.route('**/api/billing/portal', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://billing.example.test/portal' }) }) })
    await page.goto('/dashboard/billing'); await expect(page.getByRole('alert')).toContainText('Billing account unavailable.'); await page.getByRole('button', { name: 'TRY AGAIN' }).click(); await expect(page.getByText('Current Plan', { exact: true })).toBeVisible(); await expect(page.getByText('Payment issue — action required', { exact: true })).toBeVisible(); await expect(page.getByText('HubSpot native + Pipedrive, Zoho, Close webhook intake', { exact: true })).toBeVisible(); await expect(page.getByText('All currently available CRM and webhook capabilities', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Manage subscription →' })).toHaveAttribute('href', 'https://billing.example.test/portal')
  })

  test('Support preserves conversation-history contract', async ({ authenticatedPage: page }) => {
    const requests: Array<{ message: string; history: Array<{ role: string; content: string }> }> = []
    await page.route('**/api/chat/support', async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: requests.length === 1 ? 'First answer.' : 'Second answer.' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/support'); await expect(page.getByRole('log', { name: 'Support conversation' })).toBeVisible(); const composer = page.getByLabel('Support message'); await composer.fill('How do I connect HubSpot?'); await composer.press('Enter'); await expect(page.getByText('First answer.', { exact: true })).toBeVisible(); await composer.fill('And what about routing rules?'); await composer.press('Enter'); await expect(page.getByText('Second answer.', { exact: true })).toBeVisible(); await expect.poll(() => requests.length).toBe(2); expect(requests[0]).toEqual({ message: 'How do I connect HubSpot?', history: [] }); expect(requests[1].history).toEqual([{ role: 'user', content: 'How do I connect HubSpot?' }, { role: 'assistant', content: 'First answer.' }]); await composer.fill('No send yet'); await composer.press('Shift+Enter'); await expect.poll(() => requests.length).toBe(2); await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible(); await expect(page.locator('h1')).toHaveCount(1); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Support exposes a retryable assistant failure without losing the question', async ({ authenticatedPage: page }) => {
    await page.route('**/api/chat/support', async (route) => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Support is temporarily unavailable.' }) }) })
    await page.goto('/dashboard/support')
    const composer = page.getByLabel('Support message'); await composer.fill('How do I connect HubSpot?'); await composer.press('Enter')
    await expect(page.getByRole('alert')).toContainText('Support is temporarily unavailable.')
    await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible()
  })

  test('Support holds one request, prevents duplicates, and restores focus after success', async ({ authenticatedPage: page }) => {
    let requests = 0; let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/api/chat/support', async (route) => { requests += 1; await pending; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Held answer.' }) }) })
    await page.goto('/dashboard/support')
    await page.getByRole('button', { name: 'How do I connect HubSpot?' }).click(); const composer = page.getByLabel('Support message'); await expect.poll(() => requests).toBe(0); await expect(composer).toHaveValue('How do I connect HubSpot?'); await expect(composer).toBeFocused(); await composer.press('Enter'); await expect(page.getByText('Thinking...', { exact: true })).toBeVisible(); await expect(composer).toBeDisabled(); await expect(page.getByRole('button', { name: 'Send message' })).toHaveAttribute('aria-busy', 'true'); await composer.press('Enter').catch(() => {}); expect(requests).toBe(1); release(); await expect(page.getByText('Held answer.', { exact: true })).toBeVisible(); await expect(composer).toBeFocused(); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Support network failure preserves the question and retry does not auto-send', async ({ authenticatedPage: page }) => {
    let requests = 0
    await page.route('**/api/chat/support', async (route) => { requests += 1; await route.abort() })
    await page.goto('/dashboard/support'); const composer = page.getByLabel('Support message'); await composer.fill('How do I connect HubSpot?'); await composer.press('Enter'); await expect(page.getByRole('alert')).toContainText('Network error — please try again.'); await expect(page.getByText('How do I connect HubSpot?', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'TRY AGAIN' }).click(); await expect(composer).toHaveValue('How do I connect HubSpot?'); await expect(composer).toBeFocused(); expect(requests).toBe(1)
  })
})
