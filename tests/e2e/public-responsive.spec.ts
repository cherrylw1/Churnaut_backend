import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function assertPublicLayout(page: Page) {
  const offenders = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
    if (element === document.documentElement || element === document.body) return []
    const computed = getComputedStyle(element)
    if (computed.position === 'absolute' && computed.pointerEvents === 'none') return []
    const rect = element.getBoundingClientRect()
    const intrinsicOverflow = element.scrollWidth > element.clientWidth + 8 && computed.overflowX === 'visible'
    return rect.left < -1 || rect.right > window.innerWidth + 1 || intrinsicOverflow
      ? [{ tag: element.tagName.toLowerCase(), id: element.id, className: typeof element.className === 'string' ? element.className : '', left: Math.round(rect.left), right: Math.round(rect.right), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }]
      : []
  }).slice(0, 20))
  expect(offenders).toEqual([])
}

for (const width of [375, 768, 1440]) {
  test.describe(`public Signal Field at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('homepage keeps the product narrative and primary destinations', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toContainText('Make the next move obvious')
      await expect(page.getByRole('link', { name: 'GET STARTED', exact: true })).toHaveAttribute('href', '/signup')
      await expect(page.getByRole('link', { name: 'SIGN IN', exact: true })).toHaveAttribute('href', '/login')
      await expect(page.locator('[data-hero-visual="true"]')).toBeVisible()
      await expect(page.locator('[data-hero-instrument="true"]')).toBeVisible()
      await expect(page.locator('[data-public-signal-step]')).toHaveCount(3)
      await expect(page.locator('.public-home-step')).toHaveCount(3)
      await expect(page.getByText('Read the signal', { exact: true })).toHaveCount(0)
      const heroGeometry = await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>('.public-home-hero')
        const visual = document.querySelector<HTMLElement>('[data-hero-visual="true"]')
        const instrument = document.querySelector<HTMLElement>('[data-hero-instrument="true"]')
        return { minHeight: visual ? getComputedStyle(visual).minHeight : 'missing', residualGap: hero && visual ? hero.getBoundingClientRect().bottom - visual.getBoundingClientRect().bottom : 9999, internalGap: visual && instrument ? visual.getBoundingClientRect().bottom - instrument.getBoundingClientRect().bottom : 9999 }
      })
      expect(heroGeometry.minHeight).toMatch(/^(0px|auto)$/)
      expect(heroGeometry.residualGap).toBeLessThan(190)
      expect(heroGeometry.internalGap).toBeLessThan(24)
      const radii = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const major = root.getPropertyValue('--radius-major').trim()
        const nested = root.getPropertyValue('--radius-nested').trim()
        const read = (selector: string) => { const element = document.querySelector<HTMLElement>(selector); if (!element) return null; const style = getComputedStyle(element); return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] }
        return { major, nested, instrument: read('[data-hero-instrument="true"]'), signal: read('.public-home-signal-path'), pressure: read('.public-home-pressure'), path: read('.public-home-path') }
      })
      expect(radii.instrument).toEqual([radii.major, radii.major, radii.major, radii.major])
      for (const nested of [radii.signal, radii.pressure, radii.path]) expect(nested).toEqual([radii.nested, radii.nested, radii.nested, radii.nested])
      for (const href of ['/snippet.js', '/login', '/signup']) await expect(page.locator(`footer a[href="${href}"]`)).toHaveCount(1)
      await assertPublicLayout(page)
    })

    test('login preserves labeled controls and auth destinations', async ({ page }) => {
      await page.goto('/login')
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.getByLabel('Email Address')).toBeVisible()
      await expect(page.getByLabel('Password')).toBeVisible()
      await expect(page.getByRole('button', { name: /SIGN IN/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /Create an account/i })).toHaveAttribute('href', '/signup')
      await expect(page.locator('form[aria-busy="false"], form:not([aria-busy])')).toHaveCount(1)
      if (width < 1024) await expect(page.locator('.auth-story')).toBeHidden()
      else {
        await expect(page.locator('.auth-story')).toBeVisible()
        const columns = await page.locator('.auth-shell').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' '))
        expect(Number.parseFloat(columns[0])).toBeGreaterThan(Number.parseFloat(columns[1]))
      }
      await assertPublicLayout(page)
    })

    test('signup preserves onboarding labels and login destination', async ({ page }) => {
      await page.goto('/signup')
      await expect(page.locator('h1')).toHaveCount(1)
      for (const label of ['Your Name', 'Company Name', 'Email Address', 'Password']) await expect(page.getByLabel(label)).toBeVisible()
      await expect(page.getByRole('button', { name: /GET STARTED/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/login')
      await expect(page.locator('form[aria-busy="false"], form:not([aria-busy])')).toHaveCount(1)
      if (width < 1024) await expect(page.locator('.auth-story')).toBeHidden()
      else await expect(page.locator('.auth-story')).toBeVisible()
      await assertPublicLayout(page)
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
        body: JSON.stringify({ error: 'invalid_grant', error_description: `Invalid login credentials ${'x'.repeat(340)}` }),
      })
    })
    await page.goto('/login')
    await page.getByLabel('Email Address').fill('test@example.com')
    await page.getByLabel('Password').fill('not-a-real-password')
    const submit = page.locator('button[type="submit"]')
    await submit.click()
    await expect(submit).toBeDisabled()
    await expect(submit).toContainText('AUTHENTICATING…')
    await expect(submit).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByLabel('Email Address')).toBeDisabled()
    await expect(page.getByLabel('Password')).toBeDisabled()
    releaseLogin()
    await expect(page.locator('[role="alert"]').filter({ hasText: /invalid login credentials/i })).toBeVisible()
    await expect(submit).toBeEnabled()
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false')
    const alertBox = await page.locator('[role="alert"]').first().boundingBox()
    expect(alertBox ? alertBox.x + alertBox.width : 0).toBeLessThanOrEqual(375)
    await assertPublicLayout(page)
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
        body: JSON.stringify({ error: 'weak_password', msg: `Password should be stronger ${'y'.repeat(340)}` }),
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
    await expect(submit).toContainText('INITIALIZING WORKSPACE…')
    await expect(submit).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true')
    for (const label of ['Your Name', 'Company Name', 'Email Address', 'Password']) await expect(page.getByLabel(label)).toBeDisabled()
    releaseSignup()
    await expect(page.locator('[role="alert"]').filter({ hasText: /password should be stronger/i })).toBeVisible()
    await expect(submit).toBeEnabled()
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false')
    await assertPublicLayout(page)
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('public and auth surfaces remain usable with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const route of ['/', '/login', '/signup']) {
      await page.goto(route)
      await expect(page.locator('h1')).toHaveCount(1)
      const interactive = route === '/' ? page.getByRole('link', { name: 'Initialize workspace' }).first() : page.locator('button[type="submit"]')
      await interactive.hover()
      await expect.poll(() => interactive.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
      await assertPublicLayout(page)
      const transitionDuration = await page.locator('body').evaluate((body) => getComputedStyle(body).transitionDuration)
      expect(transitionDuration).toMatch(/0\.01ms|0s|1e-05s/)
    }
  })

  test('keyboard focus order remains usable on login and signup', async ({ page }) => {
    await page.goto('/login')
    const email = page.getByLabel('Email Address'); const password = page.getByLabel('Password'); const submit = page.locator('button[type="submit"]'); const create = page.getByRole('link', { name: /Create an account/i })
    await email.focus(); await page.keyboard.press('Tab'); await expect(password).toBeFocused(); await page.keyboard.press('Tab'); await expect(submit).toBeFocused(); await page.keyboard.press('Tab'); await expect(create).toBeFocused()
    const loginFocus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement as HTMLElement); return { outline: style.outlineStyle, shadow: style.boxShadow } })
    expect(loginFocus.outline !== 'none' || loginFocus.shadow !== 'none').toBe(true)

    await page.goto('/signup')
    const fullName = page.getByLabel('Your Name'); const company = page.getByLabel('Company Name'); const signupEmail = page.getByLabel('Email Address'); const signupPassword = page.getByLabel('Password'); const signupSubmit = page.locator('button[type="submit"]'); const signIn = page.getByRole('link', { name: /^Sign in$/i })
    await fullName.focus(); await page.keyboard.press('Tab'); await expect(company).toBeFocused(); await page.keyboard.press('Tab'); await expect(signupEmail).toBeFocused(); await page.keyboard.press('Tab'); await expect(signupPassword).toBeFocused(); await page.keyboard.press('Tab'); await expect(signupSubmit).toBeFocused(); await page.keyboard.press('Tab'); await expect(signIn).toBeFocused()
  })
})
