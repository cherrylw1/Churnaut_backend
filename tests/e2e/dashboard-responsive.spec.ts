import { test, expect } from './fixtures/auth'

const hasCredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)

test.describe('dashboard responsive shell', () => {
  test.skip(!hasCredentials, 'Authenticated responsive checks require E2E_EMAIL and E2E_PASSWORD.')

  test('desktop shell exposes the active route and main landmark', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard/analytics')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
    for (const route of ['/dashboard', '/dashboard/links', '/dashboard/rules', '/dashboard/scout', '/dashboard/integrations', '/dashboard/integrations/webhooks', '/dashboard/onboarding', '/dashboard/playbooks', '/dashboard/snippet', '/dashboard/settings', '/dashboard/billing', '/dashboard/support']) {
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
})
