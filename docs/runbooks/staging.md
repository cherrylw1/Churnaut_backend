# Staging environment

Staging is a separate Vercel project, Supabase project, and Upstash database. It uses synthetic tenants only, separate OAuth applications when enabled, Lemon Squeezy test resources, and restricted Resend recipients.

Set `APP_ENV=staging`, a non-production `APP_ORIGIN`/`NEXT_PUBLIC_APP_ORIGIN`, different `STAGING_SUPABASE_PROJECT_REF` and `PRODUCTION_SUPABASE_PROJECT_REF`, `BILLING_MODE=disabled` (or `test`), `STAGING_CRONS_ENABLED=false`, and `STAGING_EXTERNAL_INTEGRATIONS_ENABLED=false` by default. `npm run staging:verify` fails closed when these boundaries are not met. `npm run staging:seed` is dry-run unless `STAGING_SEED_CONFIRM=true`.

Use the protected GitHub `staging` environment workflow to install dependencies, run checks, apply ordered migrations only to `STAGING_DATABASE_URL`, verify RAG schema and `/api/health`, then run authenticated Playwright against `STAGING_APP_URL`. Promote the exact certified Git SHA separately; this repository does not provision or mutate hosted services.
