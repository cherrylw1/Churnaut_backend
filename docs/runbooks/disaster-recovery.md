# Churnaut disaster recovery runbook

This is the recovery checklist for Churnaut production. It is deliberately safe to keep in Git: it contains names, owners, and procedures, never credentials or customer data.

## Recovery objectives and ownership

Record the current targets before each drill:

| Field | Value to maintain outside Git or in an approved incident record |
| --- | --- |
| Target RPO (maximum acceptable data loss) | Owner-defined |
| Target RTO (maximum acceptable downtime) | Owner-defined |
| Hosted backup cadence and retention | Verify in Supabase/Vercel consoles |
| Last successful restore drill | Date, commit/tag, and result |

Use roles, not personal names, in this repository: incident commander, database recovery owner, application/Vercel owner, DNS/domain owner, secret-vault custodian, OAuth/integration owner, and secondary recovery operator. At least two authorized people must be able to reach GitHub, Vercel, Supabase, the DNS registrar, and the approved secret vault.

## What is authoritative

| Dependency | Recovery classification | Source of truth / recovery action |
| --- | --- | --- |
| GitHub | Authoritative code/config | Protected `main`, immutable release tag, and an encrypted Git-only mirror or bundle outside the primary account |
| Supabase Postgres/Auth | Authoritative customer/account state | Provider backup/PITR or encrypted logical backup; verify what Auth data is included |
| Supabase Storage | Currently unused | If code begins using Storage, stop the drill and add bucket inventory, object backups, policies, and restore order |
| Upstash Redis | Disposable | Provision a replacement and update Vercel; caches, rate limits, OAuth nonces, and warning dedupe cold-start |
| Vercel | Deployment/configuration target | Recreate/import from Git, restore variables from the vault, then deploy a known-good tag |
| Together AI | Stateless provider | Restore API credential and model configuration; no customer source of truth lives there |
| Resend | External email provider | Restore credential and sender DNS; do not send during a drill |
| Lemon Squeezy | External billing provider | Restore credential/webhook configuration; do not mutate billing during a drill |
| HubSpot / Calendly | Active OAuth integrations | Restore provider apps, secrets, redirect allowlists, and encrypted tokens |
| Pipedrive / Zoho / Close | Reserved integrations | Routes currently return 501; do not represent them as recoverable active flows |
| DNS / registrar / CDN | Critical control plane | Keep an exported zone inventory and recovery access outside one employee account |

`crm_tokens` are encrypted with `ENCRYPTION_KEY`. A database restore without the original key does not restore CRM connectivity. Escrow that key separately from Vercel, with two custodians; never place it in Git, a database dump, or the runbook.

## Backup policy

An owner must verify and record Supabase managed-backup/PITR status, cadence, retention, restore permissions, and whether Auth is covered. Do not promise an RPO/PITR capability until the hosted project tier and settings are verified. If the provider does not meet the approved RPO, maintain an encrypted logical database backup in a separate access boundary. Never upload dumps to CI artifacts or store them beside `ENCRYPTION_KEY`.

The application currently has no Supabase Storage API or bucket usage. Database backups do not back up Storage objects. Redis is intentionally non-authoritative: after total loss, OAuth state nonces expire, cache disappears, rate-limit counters reset, and customers can restart authorization.

## Recovery procedures

### GitHub/code loss

1. Restore the protected repository from the secondary private mirror or encrypted Git-only bundle.
2. Verify the selected release tag/commit and recreate branch protections/MFA recovery access.
3. Reconnect the Vercel project and deploy that known-good commit only.

The mirror/bundle must contain Git history only—no `.env*`, `.vercel`, database dump, or secret.

### Supabase restore

**Existing project/PITR:** restore through Supabase, determine the migration point represented by the backup, then apply only newer migrations. Verify extensions, RLS, policies, functions, and indexes. Do not apply `supabase/schema.sql` over a populated restore.

**Complete project loss:** create an isolated Supabase project, restore the tested logical/provider backup, then verify Postgres, Auth configuration, `pgcrypto`, `vector`, RLS, service-role access, leaked-password protection, and non-SQL Auth settings. A schema-only rebuild from `supabase/schema.sql` restores structure, not customer data.

Restore authoritative data first: clients, Auth identities/sessions, routing rules, analytics, domains, webhook mappings, encrypted CRM tokens, billing fields, Scout state, weekly digests, and relevant background jobs/runs. `code_embeddings` and `support_embeddings` are rebuildable from repository sources and Together AI.

### Vercel and secrets

Treat the approved vault as the recovery source and Vercel as a deployment copy. Restore all variables listed in `.env.example`, including `ENCRYPTION_KEY`, Supabase, Redis, Together, Resend, Lemon Squeezy, cron, founder, and active OAuth credentials. Keep production secrets out of a drill deployment; use non-production provider accounts.

Recovery order: recreate/import the project from Git; restore variables; attach a protected recovery/staging domain; point at restored Supabase and fresh Redis; keep `BACKGROUND_JOBS_PAUSED=true`; validate; attach production DNS only after approval; enable cron/background processing last.

### OAuth integrations

`APP_ORIGIN` controls server-side callback construction. Production should use `https://app.churnaut.com`; an isolated drill may use a dedicated recovery hostname and matching non-production OAuth applications. Provider records must include account owner, client ID, secret location, production callback, drill callback, and redirect-allowlist recovery steps. Never put client secrets here. HubSpot and Calendly are active; Pipedrive, Zoho, and Close remain unavailable.

### DNS and email

Maintain registrar, authoritative DNS provider, `app.churnaut.com`, apex `churnaut.com`, `cdn.churnaut.com`, Resend sender records, DNSSEC state, Vercel domain association, and CDN origin in an external inventory. Export/update the zone whenever DNS changes. Keep registrar MFA/recovery codes in the vault, never Git.

## Read-only restore validation

Run `npm run dr:verify-restore` against an isolated target. It performs limited reads only: connectivity to critical tables, a harmless Redis read, optional `DR_APP_URL` checks for `/login`, `/snippet.js`, and protected-route fail-closed behavior, and a PASS/FAIL decryption check for one `crm_tokens` row (without printing ciphertext or plaintext). Missing embeddings are a warning, not a customer-data restore failure. It never sends email, calls an LLM/CRM, mutates billing, writes webhooks, or runs background jobs.

Run `npm run dr:audit` before each drill and release. It checks this runbook, schema/migration presence, environment-name coverage, `APP_ORIGIN` usage, secret-safe documentation, and the current no-Storage-use assumption. If Storage APIs appear in the source tree, the audit fails until this runbook is expanded.

## Restore drill cadence and evidence

On every production release, retain a recoverable commit/tag, migration point, and current vault inventory. On every secret, DNS, or OAuth change, update the vault immediately. Quarterly, review GitHub/Vercel/Supabase/DNS ownership, backup/PITR status, retention, and zone export. At least twice each year, perform an isolated restore drill:

1. Select a backup and record its production commit/tag.
2. Restore Supabase into an isolated project and run `npm run dr:verify-restore`.
3. Confirm encrypted CRM-token decryption without revealing token contents.
4. Provision fresh Redis and a protected Vercel recovery project.
5. Load only non-production provider credentials, keep jobs/cron side effects paused, and run lint, typecheck, Vitest, and credential-free browser regressions.
6. Exercise login, tenant isolation, and read-only dashboard paths; do not send email, generate AI, call CRM APIs, mutate billing, or write webhooks.
7. Record RPO/RTO observed, missing assets, owner, evidence, and rollback decision.

Rollback is simply to keep production DNS and cron pointed at the existing deployment until the incident commander approves cutover. After validation, attach production DNS and enable background processing last.
