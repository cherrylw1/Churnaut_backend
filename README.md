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

## Important flows

- The public installation snippet uses `snippet_key` only for browser tracking and `/api/resolve`.
- Inbound integrations use the private `webhook_secret` shown under Dashboard → Integrations → Webhooks. Do not use the snippet key as a webhook credential.
- All dashboard API routes authenticate through `getAuthedClientId` and scope service-role queries by the authenticated client ID.
- Vercel cron routes are configured in `vercel.json`; configure their authorization secret in Vercel.

## Database and migrations

`supabase/schema.sql` is the reproducible fresh-install baseline. Incremental changes for existing installations live in `supabase/migrations/` and must be applied exactly once in timestamp order. Do not apply the baseline on top of an existing populated database. Keep every new schema change in both an ordered migration and the baseline.

## Deployment

Pushes to `main` deploy automatically when the repository is connected to Vercel. Set production environment variables before deploying and verify the deployment’s database points at the migrated Supabase project.
