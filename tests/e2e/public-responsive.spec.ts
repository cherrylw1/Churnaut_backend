import { expect, test } from '@playwright/test'

for (const width of [375, 768, 1440]) {
  test.describe(`public Signal Field at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('homepage keeps the product narrative and primary destinations', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toContainText('Make the next move obvious')
      await expect(page.getByRole('link', { name: 'GET STARTED', exact: true })).toHaveAttribute('href', '/signup')
      await expect(page.getByRole('link', { name: 'SIGN IN', exact: true })).toHaveAttribute('href', '/login')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('login preserves labeled controls and auth destinations', async ({ page }) => {
      await page.goto('/login')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.getByLabel('Email Address')).toBeVisible()
      await expect(page.getByLabel('Password')).toBeVisible()
      await expect(page.getByRole('button', { name: /SIGN IN/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /Create an account/i })).toHaveAttribute('href', '/signup')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })

    test('signup preserves onboarding labels and login destination', async ({ page }) => {
      await page.goto('/signup')
      await expect(page.locator('h1')).toHaveCount(1)
      for (const label of ['Your Name', 'Company Name', 'Email Address', 'Password']) await expect(page.getByLabel(label)).toBeVisible()
      await expect(page.getByRole('button', { name: /GET STARTED/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/login')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  })
}

test.describe('public auth states', () => {
  test.use({ viewport: { width: 375, height: 900 } })

  test('login exposes a deterministic pending and failed state', async ({ page }) => {
    let releaseLogin!: () => void
    const loginResponse = new Promise<void>((resolve) => { releaseLogin = resolve })
    await page.route('**/auth/v1/token*', async (route) => {
      await loginResponse
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })
    await page.goto('/login')
    await page.getByLabel('Email Address').fill('test@example.com')
    await page.getByLabel('Password').fill('not-a-real-password')
    const submit = page.locator('button[type="submit"]')
    await submit.click()
    await expect(submit).toBeDisabled()
    await expect(page.getByLabel('Email Address')).toBeDisabled()
    await expect(page.getByLabel('Password')).toBeDisabled()
    releaseLogin()
    await expect(page.locator('[role="alert"]').filter({ hasText: /invalid login credentials/i })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('signup exposes a deterministic pending state', async ({ page }) => {
    let releaseSignup!: () => void
    const signupResponse = new Promise<void>((resolve) => { releaseSignup = resolve })
    await page.route('**/auth/v1/signup*', async (route) => {
      await signupResponse
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'weak_password', msg: 'Password should be stronger' }),
      })
    })
    await page.goto('/signup')
    await page.getByLabel('Your Name').fill('Test User')
    await page.getByLabel('Company Name').fill('Test Company')
    await page.getByLabel('Email Address').fill('test@example.com')
    await page.getByLabel('Password').fill('not-a-real-password')
    const submit = page.locator('button[type="submit"]')
    await submit.click()
    await expect(submit).toBeDisabled()
    for (const label of ['Your Name', 'Company Name', 'Email Address', 'Password']) await expect(page.getByLabel(label)).toBeDisabled()
    releaseSignup()
    await expect(page.locator('[role="alert"]').filter({ hasText: /password should be stronger/i })).toBeVisible()
    await expect(page).toHaveURL(/\/signup$/)
  })
})
