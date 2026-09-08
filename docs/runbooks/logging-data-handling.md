# Logging and data handling

Server logs and `llm_logs` are operational telemetry, not a customer-data archive. New writes must use the structured logger, which strips secrets and stores bounded metadata rather than prompts, model responses, CRM payloads, or recipient addresses.

The daily `/api/cron/log-retention` job calls the service-role-only purge function. Interaction logs and webhook receipt metadata are retained for 30 days; content-free provider-attempt telemetry is retained for 180 days. The purge windows are bounded in SQL and may not be expanded by a request parameter.

Only the service role can read or write `llm_logs`, operational tables, or retention functions. Founder views receive aggregate counts and reliability metrics. Review Supabase member access, Vercel log retention, and provider dashboards quarterly; never copy raw logs into tickets or CI artifacts.
