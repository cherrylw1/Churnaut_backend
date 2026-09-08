# Churnaut

Churnaut is a multi-tenant B2B RevOps SaaS. It identifies high-intent visitors, resolves campaign and CRM signals into sessions, and personalizes a customer’s website through routing rules. Scout AI adds deal scoring, pipeline diagnostics, and actionable sales nudges.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Supabase Postgres/Auth (service-role access is scoped by verified client ID)
- Upstash Redis for caching and rate limiting
- Vercel functions and cron jobs
- Together AI model and embedding integrations, plus Resend email

## Local setup

1. Install Node.js 22+ and dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in Supabase, Upstash, AI, email, OAuth, and billing values.
3. For a brand-new Supabase project, apply `supabase/schema.sql` once; it is the complete current baseline. For an existing project, apply only migrations that have not already been applied, in filename order. The two `20260828...` migrations are required by `/api/resolve`, transactional onboarding, signup provisioning, billing webhooks, and Scout digest delivery.
4. Start the app with `npm run dev` and open `http://localhost:3000`.

Never commit `.env*` files or service-role/API tokens. Production secrets belong in Vercel Environment Variables.

## Useful commands

```bash
npm run dev          # local development
npm run lint         # ESLint
npm test             # Vitest suite
npx tsc --noEmit     # TypeScript check
npm run build        # production build
```

## Authenticated browser checks

The Playwright suite exercises the real login/session bridge and the main dashboard pages. Run it only against a dedicated non-production account and environment:

```bash
E2E_BASE_URL=https://staging.example.com \
E2E_EMAIL=e2e-user@example.com \
E2E_PASSWORD='your-test-password' \
npm run test:e2e
```

`E2E_BASE_URL` may be omitted for local testing (the suite starts the local app automatically). Never use production credentials or commit these values. CI runs these checks only when all three repository secrets are configured.

## Important flows

- The public installation snippet uses `snippet_key` only for browser tracking and `/api/resolve`.
- Inbound integrations use the private `webhook_secret` shown under Dashboard → Integrations → Webhooks. Do not use the snippet key as a webhook credential.
- Webhook endpoint URLs never contain credentials. Configure `POST /api/webhook` with `Authorization: Bearer <webhook_secret>`; custom senders may use the signed-request headers shown in the dashboard.
- All dashboard API routes authenticate through `getAuthedClientId` and scope service-role queries by the authenticated client ID.
- Vercel cron routes are configured in `vercel.json`; configure their authorization secret in Vercel.

For custom signed webhooks, send `X-Churnaut-Client-Id` as the client UUID, `X-Churnaut-Timestamp` as Unix seconds, and `X-Churnaut-Signature: v1=<lowercase hex digest>`. The digest is HMAC-SHA256 using the current `webhook_secret` over `<timestamp>.<exact request body>`. Requests older or newer than five minutes are rejected. During secret rotation, the previous secret works only for headers/signatures during the displayed 24-hour grace period and never works in a URL.

## Database and migrations

`supabase/schema.sql` is the reproducible fresh-install baseline. Incremental changes for existing installations live in `supabase/migrations/` and must be applied exactly once in timestamp order. Do not apply the baseline on top of an existing populated database. Keep every new schema change in both an ordered migration and the baseline.

### Supabase Auth security setting

Leaked-password protection is a Supabase Auth project setting, not a SQL migration. An authorized project owner must enable it in Authentication → Password Security on staging, rerun the Supabase Security Advisor, and then repeat the same controlled change in production. Record the dashboard verification with the deployment change; repository checks cannot verify this hosted setting.

## Deployment

Pushes to `main` deploy automatically when the repository is connected to Vercel. Set production environment variables before deploying and verify the deployment’s database points at the migrated Supabase project.

## Background digest queue

The Monday digest cron now creates one durable weekly run; a Vercel worker processes paginated scan and delivery jobs. Jobs are claimed with leases, retried with backoff, and moved to `dead` after five failed attempts. Queue payloads contain IDs and week boundaries only. Set `BACKGROUND_JOBS_PAUSED=true` as an emergency pause switch; pending work remains in Supabase.

## Disaster recovery

The recovery procedure is maintained in [docs/runbooks/disaster-recovery.md](docs/runbooks/disaster-recovery.md). Run `npm run dr:audit` before a release or restore drill, and run `npm run dr:verify-restore` only against an isolated recovery target. Hosted backup/PITR settings, secret-vault custody, OAuth applications, and DNS remain outside Git and must be verified by their owners.

For operations, inspect `weekly_digest_runs` and `background_jobs` with the service role, review rows where `status = 'dead'`, and requeue an individual job with `select public.requeue_background_job('<job-id>')`. Apply the queue migration before enabling the worker cron, verify it in staging, and never run the former sequential sender alongside queued delivery jobs.
