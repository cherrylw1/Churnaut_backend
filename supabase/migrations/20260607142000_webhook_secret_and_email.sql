-- Migration: Webhook Secret, Client Email, and Processed Webhooks table

-- 1. Add webhook_secret column to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS webhook_secret uuid DEFAULT gen_random_uuid();
-- Backfill existing null webhook_secret values
UPDATE clients SET webhook_secret = gen_random_uuid() WHERE webhook_secret IS NULL;

-- 2. Add email column to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;
-- Add performance index on lower(email)
CREATE INDEX IF NOT EXISTS clients_lower_email_idx ON clients (lower(email));

-- 3. Create processed_webhooks table for Lemon Squeezy webhook idempotency
CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id text PRIMARY KEY,
    processed_at timestamptz DEFAULT now()
);
