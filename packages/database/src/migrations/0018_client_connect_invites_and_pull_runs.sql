BEGIN;

CREATE TABLE IF NOT EXISTS client_connect_invite (
  invite_id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  client_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by_actor_id TEXT NOT NULL,
  created_by_actor_role TEXT NOT NULL,
  cancelled_by_actor_id TEXT,
  cancelled_by_actor_role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_connect_invite_tenant_created_at
  ON client_connect_invite (tenant_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_connect_invite_status_updated_at
  ON client_connect_invite (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS integration_pull_run (
  run_id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  provider TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  status TEXT NOT NULL,
  connection_status TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_by_actor_id TEXT NOT NULL,
  created_by_actor_role TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_integration_pull_run_tenant_provider_started_at
  ON integration_pull_run (tenant_slug, provider, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_pull_run_status_started_at
  ON integration_pull_run (status, started_at DESC);

CREATE TABLE IF NOT EXISTS business_central_oauth_connection (
  tenant_slug TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  tenant_id TEXT,
  tenant_label TEXT,
  company_id TEXT NOT NULL,
  company_name TEXT,
  environment TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_business_central_oauth_connection_updated_at
  ON business_central_oauth_connection (updated_at DESC);

CREATE TABLE IF NOT EXISTS odoo_connection (
  tenant_slug TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  base_url TEXT NOT NULL,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  uid INTEGER NOT NULL,
  company_id TEXT,
  company_name TEXT,
  default_journal_id TEXT,
  default_product_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_odoo_connection_updated_at
  ON odoo_connection (updated_at DESC);

COMMIT;
