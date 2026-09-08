import { expect, test } from './fixtures/auth'
import { cleanupSyntheticTenant, test as stagingTest } from './fixtures/staging'

// These tests run only in the protected staging workflow. They intentionally
// use deterministic fixtures/mocks for provider calls so a release gate never
// contacts production CRMs or billing providers.
test.describe('critical product journey', () => {
  test.skip(process.env.E2E_BUSINESS_FLOWS !== 'true', 'Business-flow E2E requires the protected staging environment')
  stagingTest.skip(process.env.E2E_BUSINESS_FLOWS !== 'true', 'Business-flow E2E requires the protected staging environment')

  stagingTest('signup and onboarding controls are usable for an isolated run', async ({ page, runEmail, runPassword }) => {
    try {
      await page.goto('/signup')
    await expect(page.getByLabel('Your Name')).toBeVisible()
    await expect(page.getByLabel('Company Name')).toBeVisible()
    await expect(page.getByLabel('Email Address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await page.getByLabel('Your Name').fill('Churnaut E2E')
    await page.getByLabel('Company Name').fill(`Synthetic ${runEmail.split('@')[0]}`)
    await page.getByLabel('Email Address').fill(runEmail)
    await page.getByLabel('Password').fill(runPassword)
    await page.getByRole('button', { name: 'GET STARTED' }).click()
    await expect(page).toHaveURL(/\/dashboard\/onboarding|\/login/, { timeout: 30_000 })

    await page.goto('/dashboard/onboarding')
    await expect(page.getByText('Step 1 of 5')).toBeVisible()
    await page.getByRole('button', { name: 'None', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('textbox').fill('Synthetic B2B software teams evaluating personalization')
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: /200-500 employees/i }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: 'Cold Email', exact: true }).click()
    await page.getByRole('button', { name: 'NEXT', exact: true }).click()
    await page.getByRole('button', { name: /High-intent buyers/i }).click()
    await page.route('**/api/ai/onboarding', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }) })
    await page.getByRole('button', { name: 'COMPLETE SETUP', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/rules/, { timeout: 30_000 })
    } finally {
      await cleanupSyntheticTenant(runEmail)
    }
  })

  test('CRM, rules, links, billing, Scout, and logout remain safe and interactive', async ({ authenticatedPage: page }) => {
    await page.route('**/api/oauth/crm', async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true, crm_type: 'hubspot', connected_at: new Date().toISOString() }) })
      else if (route.request().method() === 'DELETE') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      else await route.continue()
    })
    await page.goto('/dashboard/integrations/crm/hubspot')
    await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'DISCONNECT HUBSPOT', exact: true }).click()
    await expect(page.getByText('DISCONNECTED', { exact: true })).toBeVisible()

    await page.goto('/dashboard/rules')
    await expect(page.getByRole('heading', { name: 'ROUTING RULES' })).toBeVisible()
    const addRule = page.getByRole('button', { name: /ADD ROUTING RULE|Add Rule/i }).first()
    if (await addRule.count()) await addRule.click()
    await expect(page.getByText(/Create New Rule|CREATE RULE/i).first()).toBeVisible()
    const ruleForm = page.locator('form').filter({ hasText: 'CREATE RULE' }).last()
    await ruleForm.locator('select').nth(2).selectOption('inject_copy')
    await ruleForm.locator('textarea').first().fill('Synthetic personalized headline')
    await ruleForm.getByRole('button', { name: 'CREATE RULE', exact: true }).click()
    await page.reload()
    await expect(page.getByText('Synthetic personalized headline')).toBeVisible({ timeout: 15_000 })

    await page.goto('/dashboard/links')
    await expect(page.getByText(/TRACKED LINKS|No tracked links yet/i).first()).toBeVisible()
    const createLink = page.getByRole('button', { name: /Create Link/i }).first()
    if (await createLink.count()) await createLink.click()
    await expect(page.getByText(/Generate Tracked Link/i)).toBeVisible()
    const linkForm = page.locator('form').filter({ hasText: 'GENERATE TRACKED LINK' }).last()
    await linkForm.locator('input[type="url"]').fill('https://staging.example.test/e2e')
    await linkForm.getByRole('button', { name: /GENERATE TRACKED LINK/i }).click()
    await expect(page.getByText(/LINK GENERATED SUCCESSFULLY/i)).toBeVisible()
    await page.reload()
    await expect(page.getByText('https://staging.example.test/e2e')).toBeVisible({ timeout: 15_000 })

    await page.goto('/dashboard/billing')
    await expect(page.getByRole('heading', { name: /Billing & Plan/i })).toBeVisible()
    await expect(page.getByText(/Monthly Tracked Visits — .* Plan/i)).toBeVisible()
    if (process.env.APP_ENV === 'staging') {
      const portalResponse = await page.request.get('/api/billing/portal')
      expect(portalResponse.ok()).toBeTruthy()
      expect((await portalResponse.json()).disabled).toBe(true)
    }

    await page.goto('/dashboard/scout')
    await expect(page.getByText(/SCOUT/i).first()).toBeVisible()
    const refresh = page.getByRole('button', { name: 'RUN SCOUT ANALYSIS', exact: true })
    await expect(refresh).toBeVisible()
    const scoutResponse = page.waitForResponse((response) => response.url().includes('/api/scout/score') && response.request().method() === 'POST')
    await refresh.click()
    await expect((await scoutResponse).ok()).toBeTruthy()

    await page.getByRole('button', { name: 'Sign Out' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('deployed snippet resolve path performs a DOM personalization swap', async ({ page }) => {
    const siteUrl = process.env.E2E_TEST_SITE_URL
    const snippetKey = process.env.E2E_SNIPPET_KEY
    if (!siteUrl || !snippetKey) throw new Error('E2E_TEST_SITE_URL and E2E_SNIPPET_KEY are required for personalization certification')
    let resolveSeen = false
    let resolveResponseOk = false
    const stagingOrigin = new URL(process.env.E2E_BASE_URL || siteUrl).origin
    page.on('request', (request) => { if (request.url().includes('/api/resolve')) { resolveSeen = true; expect(new URL(request.url()).origin).toBe(stagingOrigin) } })
    page.on('response', (response) => { if (response.url().includes('/api/resolve') && response.ok()) resolveResponseOk = true })
    await page.addInitScript(({ key, origin }) => { const w = window as Window & { SR_CLIENT_ID?: string; SR_API_ORIGIN?: string }; w.SR_CLIENT_ID = key; w.SR_API_ORIGIN = origin }, { key: snippetKey, origin: stagingOrigin })
    await page.goto(`${siteUrl}${siteUrl.includes('?') ? '&' : '?'}sid=e2e-${Date.now()}`)
    await expect.poll(() => resolveSeen, { timeout: 15_000 }).toBe(true)
    await expect.poll(() => resolveResponseOk, { timeout: 15_000 }).toBe(true)
    await expect(page.locator('#e2e-headline')).toHaveText('Synthetic personalized headline')
  })
})
