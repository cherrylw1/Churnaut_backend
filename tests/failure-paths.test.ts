import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('database failure paths', () => {
  it('does not bypass the routing-rule entitlement check when its read fails', () => {
    const route = source('app/api/rules/route.ts')
    expect(route).toContain('error: existingRulesError')
    expect(route).toContain('Unable to verify the routing rule limit')
    expect(route).toContain("'reorder_routing_rules'")
    expect(route).toContain("'delete_routing_rule_and_resequence'")
  })

  it('does not treat link ID lookup failures as available IDs', () => {
    const links = source('app/api/links/route.ts')
    const webhook = source('app/api/webhook/route.ts')
    expect(links).toContain('error: uniquenessError')
    expect(links).toContain('if (!isUnique)')
    expect(webhook).toContain('Session ID availability check failed')
    expect(webhook).toContain('Unable to allocate a unique webhook session ID')
  })

  it('does not create a webhook session after a failed matching-session query', () => {
    const route = source('app/api/webhook/route.ts')
    expect(route).toContain('error: sessionLookupError')
    expect(route).toContain('error: emailLookupError')
    expect(route).toContain("{ error: 'Session lookup unavailable' }, { status: 503 }")
    expect(route).toContain('Webhook authentication service unavailable')
  })

  it('distinguishes domain-database failures from unregistered origins', () => {
    const domainAccess = source('lib/domain-access.ts')
    const snippetPing = source('app/api/snippet-ping/route.ts')
    expect(domainAccess).toContain('error: domainError')
    expect(domainAccess).toContain('error: clientError')
    expect(snippetPing).toContain('Unable to verify snippet client')
  })

  it('does not cache partial Scout pipeline data', () => {
    const route = source('app/api/scout/pipeline/route.ts')
    expect(route).toContain('error: historyError')
    expect(route).toContain('Database error fetching session mappings')
    expect(route).toContain('Database error fetching recent activity')
    expect(route).toContain('Database error fetching acceleration triggers')
  })

  it('does not feed failed account queries to either support assistant', () => {
    const support = source('app/api/chat/support/route.ts')
    const founder = source('app/api/chat/founder/route.ts')
    expect(support).toContain('Unable to load account context')
    expect(support).toContain('Unable to debug the session')
    expect(founder).toContain('Unable to load live health data')
    expect(founder).toContain('if (error) throw error')
  })
})
