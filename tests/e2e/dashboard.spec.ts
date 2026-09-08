import { test, expect } from './fixtures/auth'

const dashboardRoutes = [
  ['/dashboard', 'Dashboard'],
  ['/dashboard/links', 'Tracked Links'],
  ['/dashboard/rules', 'Routing Rules'],
  ['/dashboard/analytics', 'Analytics'],
  ['/dashboard/scout', 'Scout'],
  ['/dashboard/icp', 'ICP Builder'],
  ['/dashboard/ai-insights', 'AI Insights'],
  ['/dashboard/integrations', 'Integrations'],
  ['/dashboard/snippet', 'Snippet'],
  ['/dashboard/settings', 'Settings'],
  ['/dashboard/billing', 'Billing'],
  ['/dashboard/support', 'Support'],
] as const

test('authenticated user can open every primary dashboard route', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000)
  const authFailures: string[] = []
  const pageErrors: string[] = []
  const pendingApiRequests = new Set<object>()

  page.on('response', (response) => {
    if (response.url().includes('/api/') && [401, 403].includes(response.status())) {
      authFailures.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/api/')) pendingApiRequests.add(request)
  })
  const settleRequest = (request: object) => pendingApiRequests.delete(request)
  page.on('requestfinished', settleRequest)
  page.on('requestfailed', settleRequest)

  for (const [route, label] of dashboardRoutes) {
    await test.step(`open ${label}`, async () => {
      await page.goto(route)
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}(?:\\/)?$`), { timeout: 30_000 })
      await expect(page.getByText('CHURNAUT')).toBeVisible()
      await expect.poll(() => pendingApiRequests.size, {
        timeout: 15_000,
        message: `Initial API requests did not settle while opening ${route}`,
      }).toBe(0)
      expect(authFailures, `Unexpected authentication failures while opening ${route}`).toEqual([])
      expect(pageErrors, `Unexpected uncaught browser errors while opening ${route}`).toEqual([])
    })
  }

  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: /Tracked Links/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Routing Rules/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Integrations/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Billing/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Scout/i })).toBeVisible()

  expect(authFailures, 'Unexpected authentication failures while opening dashboard routes').toEqual([])
  expect(pageErrors, 'Unexpected uncaught browser errors while opening dashboard routes').toEqual([])
})
