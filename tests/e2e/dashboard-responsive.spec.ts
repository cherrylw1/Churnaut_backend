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
    await expect(page.getByText('SIGNAL ROOM', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search workspace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('home overview keeps Signal Room hierarchy and command actions', async ({ authenticatedPage: page }) => {
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

  test('Scout keeps pipeline state, action queue, health controls, and deal disclosure semantic', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) })
    })
    await page.route('**/api/scout/pipeline*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        pipeline_snapshot: { id: 'snapshot', total_deals: 3, red_count: 1, amber_count: 1, green_count: 1, total_pipeline_value: 120000, pressure_score: 72, created_at: new Date().toISOString() },
        deal_scores: [{ deal_id: 'deal-red', id: 'deal-red', deal_name: 'Synthetic Red Deal', stage: 'Evaluation', deal_value: 50000, close_date: null, days_in_stage: 12, last_activity_days: 4, contact_count: 2, website_visits_7d: 3, score: 'RED', primary_risk: 'No recent rep activity', next_action: 'Re-engage the buyer today', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }, { deal_id: 'deal-amber', id: 'deal-amber', deal_name: 'Synthetic Amber Deal', stage: 'Discovery', deal_value: 40000, close_date: null, days_in_stage: 4, last_activity_days: 2, contact_count: 1, website_visits_7d: 1, score: 'AMBER', primary_risk: 'Slow movement', next_action: 'Confirm timeline', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }, { deal_id: 'deal-green', id: 'deal-green', deal_name: 'Synthetic Green Deal', stage: 'Proposal', deal_value: 30000, close_date: null, days_in_stage: 2, last_activity_days: 1, contact_count: 3, website_visits_7d: 5, score: 'GREEN', primary_risk: 'None', next_action: 'Keep momentum', draft_email: null, rep_name: 'Synthetic Rep', rep_email: 'rep@example.test' }], acceleration_triggers: [] }) })
    })
    await page.route('**/api/scout/blindspots', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.route('**/api/scout/obituaries', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard/scout')
    await expect(page.getByRole('heading', { name: 'Pipeline state' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Action queue' })).toBeVisible()
    await expect(page.getByText('PIPELINE HEALTH', { exact: true })).toBeVisible()
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
    await page.getByRole('button', { name: 'NUDGE REP' }).first().click()
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog', { name: /Nudge deal representative/i })).toHaveCount(0)
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
    await expect(page.getByRole('button', { name: 'RUN SCOUT ANALYSIS' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('rules and tracked links expose Signal Room workstation semantics', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/playbooks', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playbooks: [] }) }) })
    let reorderPayload: unknown = null
    await page.route('**/api/rules', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rules: [
          { id: 'rule-1', priority: 1, active: true, signal_type: 'Cold Email', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.test/calendar' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() },
          { id: 'rule-2', priority: 2, active: false, signal_type: 'LinkedIn Ad', conditions: { job_title_contains: 'VP' }, action_type: 'inject_copy', action_payload: {}, target_selector: '.headline', variant_content: 'Synthetic copy', created_at: new Date().toISOString() },
          { id: 'rule-3', priority: 3, active: true, signal_type: 'Returning Visitor', conditions: {}, action_type: 'show_calendar', action_payload: { calendar_url: 'https://example.test/calendar' }, target_selector: null, variant_content: null, created_at: new Date().toISOString() },
        ] }) })
      } else {
        reorderPayload = route.request().postDataJSON()
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
      if (route.request().method() === 'POST') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, trackedUrl: 'https://churnaut.test/generated' }) })
      else await route.continue()
    })
    await page.getByLabel('Destination URL (Required)').fill('https://example.test/landing')
    await page.getByRole('button', { name: 'GENERATE TRACKED LINK' }).click()
    await expect(page.getByText('LINK GENERATED SUCCESSFULLY', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Tracked Link URL')).toHaveValue('https://churnaut.test/generated')
    await expect(page.getByRole('button', { name: 'COPY' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate Another' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Generate Tracked Link' })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
          top_industries: null, top_deal_stages: null, generated_at: new Date().toISOString(),
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
    await expect(page.getByRole('heading', { name: 'Routing output' })).toBeVisible()
    const buildButton = page.getByRole('button', { name: 'BUILD MY ICP' })
    await buildButton.click()
    await expect.poll(() => buildMethod).toBe('POST')
    expect(buildBody).toBeNull()
    await expect(page.getByText('Updated evidence model.', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('2')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('AI Insights preserves briefing and anomaly contracts', async ({ authenticatedPage: page }) => {
    let digestGenerated = false
    let detectionRun = false
    let markedRead: unknown = null
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { plan: 'growth' } }) }) })
    await page.route('**/api/ai/digest', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-1', week_start: '2026-09-14', summary: 'Pipeline momentum is improving.', top_signal: 'Cold Email is converting.', rep_spotlight: 'Asha led the week.', recommendation: 'Route more high-fit accounts to Asha.', created_at: new Date().toISOString() } }) })
      else { digestGenerated = true; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ digest: { id: 'digest-2', week_start: '2026-09-14', summary: 'Generated summary.', top_signal: 'Generated signal.', rep_spotlight: 'Generated rep.', recommendation: 'Generated recommendation.' } }) }) }
    })
    await page.route('**/api/ai/anomaly', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [
        { id: 'alert-critical', alert_text: 'Critical conversion drop.', severity: 'critical', created_at: new Date().toISOString() },
        { id: 'alert-warning', alert_text: 'Warning: stalled pipeline.', severity: 'warning', created_at: new Date().toISOString() },
        { id: 'alert-info', alert_text: 'Info: new signal detected.', severity: 'info', created_at: new Date().toISOString() },
      ] }) })
      else if (route.request().method() === 'POST') { detectionRun = true; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [{ id: 'alert-new', alert_text: 'New detection result.', severity: 'warning', created_at: new Date().toISOString() }] }) }) }
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
    await expect(page.getByText('Generated recommendation.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'RUN DETECTION' }).click()
    await expect.poll(() => detectionRun).toBe(true)
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

  test('Webhook workstation preserves auth, mapping, and log contracts', async ({ authenticatedPage: page }) => {
    let rotateMethod = ''; let rotateBody: string | null = null; let mappingBody: unknown = null; let deleteUrl = ''
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { webhook_secret: 'secret-one', webhook_query_auth_expires_at: '2026-09-20T00:00:00.000Z', webhook_previous_secret_expires_at: null } }) }) })
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

  test('Snippet deployment preserves runtime and verification contracts', async ({ authenticatedPage: page }) => {
    let statusRequests = 0
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { snippet_key: 'fixture-client-key' } }) }) })
    await page.route('**/api/snippet-status', async (route) => { statusRequests += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: true, lastPing: '2026-09-18T10:00:00.000Z' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/snippet'); await expect(page.locator('h1')).toHaveCount(1)
    for (const heading of ['Install runtime', 'Mark target elements', 'Verify connection', 'Platform guides']) await expect(page.getByText(heading, { exact: true })).toBeVisible()
    await expect(page.locator('pre').first()).toContainText('window.SR_CLIENT_ID = \'fixture-client-key\''); await expect(page.locator('pre').first()).toContainText('https://cdn.churnaut.com/snippet.js'); await page.getByRole('button', { name: 'CHECK STATUS' }).click(); await expect.poll(() => statusRequests).toBe(1); await expect(page.getByRole('status')).toContainText('CONNECTION CONFIRMED'); await expect(page.getByRole('button', { name: 'Webflow Setup' })).toHaveAttribute('aria-controls', 'snippet-guide-webflow'); await page.getByRole('button', { name: 'Webflow Setup' }).press('Enter'); await expect(page.locator('#snippet-guide-webflow')).toHaveAttribute('role', 'region'); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
    await page.keyboard.press('Escape')
    await expect(navigation).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
  })

  test('command palette traps focus and closes with Escape under reduced motion', async ({ authenticatedPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Search workspace' }).click()
    const palette = page.getByRole('dialog', { name: 'Search workspace' })
    await expect(palette).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search workspace' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('priority dashboard routes stay usable at phone width', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    for (const route of ['/dashboard', '/dashboard/links', '/dashboard/rules', '/dashboard/scout', '/dashboard/icp', '/dashboard/ai-insights', '/dashboard/integrations', '/dashboard/integrations/webhooks', '/dashboard/onboarding', '/dashboard/playbooks', '/dashboard/snippet', '/dashboard/settings', '/dashboard/billing', '/dashboard/support']) {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()
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

  test('Billing preserves cycle, pricing, and checkout wiring', async ({ authenticatedPage: page }) => {
    await page.route('**/api/client', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ client: { id: 'client-e2e', plan: 'growth', plan_status: 'active', monthly_visits: 1200 } }) }) }); await page.route('**/api/billing/portal', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://billing.example.test/portal' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/billing'); await expect(page.locator('h1')).toHaveCount(1); await expect(page.getByText('Monthly Tracked Visits — Growth Plan', { exact: true })).toBeVisible(); await expect(page.getByText('Current Plan', { exact: true })).toBeVisible(); const billingSwitch = page.getByRole('switch', { name: /monthly and yearly/i }); await expect(billingSwitch).toHaveAttribute('aria-checked', 'false'); const monthlyHref = await page.getByRole('link', { name: 'Upgrade to Pro →' }).getAttribute('href'); expect(monthlyHref).toContain(`/buy/${PLAN_PRICING.pro.monthlyVariantId}`); expect(monthlyHref).toContain('checkout%5Bcustom%5D%5Bclient_id%5D=client-e2e'); await billingSwitch.click(); await expect(billingSwitch).toHaveAttribute('aria-checked', 'true'); await expect(page.getByText(/Billed \$[\d,]+\/yr/).first()).toBeVisible(); const yearlyHref = await page.getByRole('link', { name: 'Upgrade to Pro →' }).getAttribute('href'); expect(yearlyHref).toContain(`/buy/${PLAN_PRICING.pro.yearlyVariantId}`); expect(yearlyHref).toContain('checkout%5Bcustom%5D%5Bclient_id%5D=client-e2e'); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Support preserves conversation-history contract', async ({ authenticatedPage: page }) => {
    const requests: Array<{ message: string; history: Array<{ role: string; content: string }> }> = []
    await page.route('**/api/chat/support', async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: requests.length === 1 ? 'First answer.' : 'Second answer.' }) }) })
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/dashboard/support'); await expect(page.getByRole('log', { name: 'Support conversation' })).toBeVisible(); const composer = page.getByLabel('Support message'); await composer.fill('How do I connect HubSpot?'); await composer.press('Enter'); await expect(page.getByText('First answer.', { exact: true })).toBeVisible(); await composer.fill('And what about routing rules?'); await composer.press('Enter'); await expect(page.getByText('Second answer.', { exact: true })).toBeVisible(); await expect.poll(() => requests.length).toBe(2); expect(requests[0]).toEqual({ message: 'How do I connect HubSpot?', history: [] }); expect(requests[1].history).toEqual([{ role: 'user', content: 'How do I connect HubSpot?' }, { role: 'assistant', content: 'First answer.' }]); await composer.fill('No send yet'); await composer.press('Shift+Enter'); await expect.poll(() => requests.length).toBe(2); await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible(); await expect(page.locator('h1')).toHaveCount(1); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
