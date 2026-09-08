import { createClient } from '@supabase/supabase-js'
import { test as base } from '@playwright/test'

type StagingFixture = { runEmail: string; runPassword: string; runMarker: string }

export const test = base.extend<StagingFixture>({
  runMarker: async ({}, _use) => { await _use(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) },
  runEmail: async ({ runMarker }, _use) => { await _use(`${runMarker}@example.invalid`) },
  runPassword: async ({}, _use) => { await _use(`E2e-${Date.now()}-safe-password!`) },
})

export async function cleanupSyntheticTenant(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = data.users.find((candidate) => candidate.email === email)
  if (user) await admin.auth.admin.deleteUser(user.id)
  await admin.from('clients').delete().eq('email', email)
}

export { expect } from '@playwright/test'
