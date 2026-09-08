import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const relative = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(relative) : /\.(ts|tsx)$/.test(entry.name) ? [relative] : []
})
const failures: string[] = []
const requireFile = (file: string) => { if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`) }

requireFile('docs/runbooks/disaster-recovery.md')
requireFile('supabase/schema.sql')
requireFile('vercel.json')
if (!fs.existsSync(path.join(root, 'supabase/migrations')) || !fs.readdirSync(path.join(root, 'supabase/migrations')).some((name) => name.endsWith('.sql'))) failures.push('missing ordered Supabase migrations')
const trackedEnvFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter((file) => /^\.env(?:$|\.)/.test(file) && file !== '.env.example')
if (trackedEnvFiles.length) failures.push(`tracked environment secret file(s): ${trackedEnvFiles.join(', ')}`)

const envExample = read('.env.example')
const envNames = new Set([...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]))
const platformOnly = new Set(['NODE_ENV', 'VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV'])
const source = walk('app').concat(walk('lib')).map(read).join('\n')
const referenced = new Set([...source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))
for (const name of referenced) if (!platformOnly.has(name) && !envNames.has(name)) failures.push(`process.env.${name} is missing from .env.example`)

const activeOAuth = ['app/api/oauth/hubspot/route.ts', 'app/api/oauth/hubspot/callback/route.ts', 'app/api/oauth/calendly/route.ts', 'app/api/oauth/calendly/callback/route.ts', 'lib/integrations/hubspot-pipeline.ts'].map(read).join('\n')
if (!activeOAuth.includes('getAppOrigin')) failures.push('active OAuth code does not use getAppOrigin')
if (/https:\/\/app\.churnaut\.com\/api\/oauth\//.test(activeOAuth)) failures.push('hardcoded production OAuth callback remains in active code')

const sourceRoots = ['app', 'lib', 'scripts', 'components', 'hooks'].filter((dir) => fs.existsSync(path.join(root, dir)))
const storageFiles = sourceRoots.flatMap(walk).filter((file) => /\.(ts|tsx)$/.test(file)).filter((file) => /supabase\.storage|\.storage\.from|storage\.from/.test(read(file)))
if (storageFiles.length) failures.push(`Supabase Storage usage found; expand DR runbook before proceeding: ${storageFiles.join(', ')}`)

const runbook = read('docs/runbooks/disaster-recovery.md')
for (const heading of ['RPO', 'RTO', 'GitHub', 'Supabase Postgres/Auth', 'Supabase Storage', 'Redis', 'Vercel', 'ENCRYPTION_KEY', 'HubSpot', 'Calendly', 'DNS', 'Resend', 'restore drill', 'Rollback']) if (!runbook.toLowerCase().includes(heading.toLowerCase())) failures.push(`runbook missing ${heading}`)
if (/-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----|(?:API_KEY|SECRET|TOKEN)=\S+/.test(runbook)) failures.push('runbook appears to contain credential material')

if (failures.length) {
  console.error('DR audit FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('DR audit PASS: repository recovery contract is present and secret-safe')
}
