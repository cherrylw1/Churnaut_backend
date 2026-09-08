import { expect, test as base, type Page } from '@playwright/test'

type AuthFixtures = {
  authenticatedPage: Page
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, provide) => {
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    if (!email || !password) {
      throw new Error('Authenticated E2E tests require E2E_EMAIL and E2E_PASSWORD for a dedicated non-production account.')
    }

    await page.goto('/login')
    await page.getByLabel('Email Address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'SIGN IN' }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\/)?$/, { timeout: 30_000 })
    await expect(page.getByText('Securing your workspace…')).toHaveCount(0, { timeout: 30_000 })
    await provide(page)
  },
})

export { expect }
