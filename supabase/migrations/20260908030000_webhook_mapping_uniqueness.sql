-- Production was verified duplicate-free before adding these concurrency
-- guards. Exact mapping retries and parallel Scout runs are now idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_mappings_unique_pair
  ON webhook_mappings(client_id, external_field, internal_field);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_scores_client_deal
  ON deal_scores(client_id, deal_id);
