import { test, expect } from './fixtures/auth'

test('unauthenticated dashboard access returns to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 30_000 })
})

test('stalled server-session cleanup still fails closed', async ({ page }) => {
  await page.route('**/api/auth/session', async () => {
    await new Promise<void>(() => undefined)
  })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 15_000 })
})

test('stalled session bridge POST fails closed', async ({ page }) => {
  let postSeen = false
  await page.addInitScript(() => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIiwiZXhwIjoyMDAwMDAwMDAwfQ.fake'
    localStorage.setItem('sb-auth-token', JSON.stringify({
      access_token: token,
      refresh_token: 'fake-refresh-token',
      expires_in: 3600,
      expires_at: 2_000_000_000,
      token_type: 'bearer',
      user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated', role: 'authenticated' },
    }))
  })
  await page.route('**/api/auth/session', async (route) => {
    if (route.request().method() === 'POST') {
      postSeen = true
      await new Promise<void>(() => undefined)
      return
    }
    await route.continue()
  })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 20_000 })
  expect(postSeen, 'Expected the dashboard to attempt the server-session POST').toBe(true)
})

test('invalid credentials do not establish a session', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email Address').fill('invalid-e2e-user@example.invalid')
  await page.getByLabel('Password').fill('definitely-not-valid')
  await page.getByRole('button', { name: 'SIGN IN' }).click()
  await expect(page.getByRole('main').getByText(/invalid|credentials|failed|unable/i)).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/login/)
  expect((await page.context().cookies()).find((cookie) => cookie.name === 'churnaut-session')).toBeUndefined()
})

test('login creates an HttpOnly server session and survives reload', async ({ authenticatedPage: page }) => {
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'churnaut-session')
  expect(sessionCookie).toBeDefined()
  expect(sessionCookie?.httpOnly).toBe(true)
  const clientResponse = await page.request.get('/api/client')
  expect(clientResponse.status()).toBe(200)
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard(?:\/)?$/)
  await expect(page.getByText('CHURNAUT')).toBeVisible()
})

test('dashboard recreates the bridge cookie after it is removed', async ({ authenticatedPage: page }) => {
  await page.context().clearCookies({ name: 'churnaut-session' })
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard(?:\/)?$/)
  expect((await page.context().cookies()).find((cookie) => cookie.name === 'churnaut-session')).toBeDefined()
})

test('clearing the browser session signs the user out', async ({ authenticatedPage: page }) => {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 30_000 })
})

test('sign out removes access', async ({ authenticatedPage: page }) => {
  await page.getByRole('button', { name: 'Sign Out' }).click()
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 30_000 })
  expect((await page.context().cookies()).find((cookie) => cookie.name === 'churnaut-session')).toBeUndefined()
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login(?:\/?$|\?)/, { timeout: 30_000 })
})
