BEGIN;

CREATE TABLE IF NOT EXISTS quickbooks_oauth_connection (
  tenant_slug TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  realm_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  company_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quickbooks_oauth_connection_updated_at
  ON quickbooks_oauth_connection (updated_at DESC);

COMMIT;
