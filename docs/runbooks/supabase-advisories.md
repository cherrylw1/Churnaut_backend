# Supabase advisory release checklist

1. Apply the ordered migrations to staging.
2. Run `npm run supabase:verify-advisors` with the staging service-role key. Any failed check blocks promotion.
3. In Supabase Auth settings, enable Leaked Password Protection and record the Security Advisor result.
4. Confirm the vector extension is in `extensions` and tenant policies are enabled without unexpected overlaps.
5. Repeat the same checks after the production migration and retain the evidence with the release record.

The verifier is read-only and never prints credentials. Auth management-plane settings and the hosted Security Advisor remain manual checks.
