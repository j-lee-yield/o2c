BEGIN;

CREATE TABLE IF NOT EXISTS sap_business_one_connection (
  tenant_slug TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  base_url TEXT NOT NULL,
  company_database TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  language TEXT,
  session_id TEXT NOT NULL,
  route_id TEXT,
  company_name TEXT,
  session_timeout_minutes INTEGER,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sap_business_one_connection_updated_at
  ON sap_business_one_connection (updated_at DESC);

CREATE TABLE IF NOT EXISTS sap_business_one_sync_run (
  run_id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  sync_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL,
  invoices_synced_count INTEGER NOT NULL DEFAULT 0,
  customers_synced_count INTEGER NOT NULL DEFAULT 0,
  payments_synced_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sap_business_one_sync_run_tenant_started_at
  ON sap_business_one_sync_run (tenant_slug, started_at DESC);

COMMIT;
