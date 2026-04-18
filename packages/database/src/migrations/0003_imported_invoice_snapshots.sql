CREATE TABLE imported_invoice_snapshot (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'default',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_by_actor_id text,
  created_by_actor_role text,
  updated_by_actor_id text,
  updated_by_actor_role text,
  source_provider text NOT NULL,
  source_kind text NOT NULL,
  external_id text NOT NULL,
  company_id text,
  customer_name text NOT NULL,
  customer_reference text,
  invoice_number text NOT NULL,
  currency text NOT NULL,
  total_amount_cents bigint NOT NULL CHECK (total_amount_cents > 0),
  open_amount_cents bigint NOT NULL CHECK (open_amount_cents >= 0),
  source_status text NOT NULL,
  issued_at date,
  due_date date,
  last_imported_at timestamptz NOT NULL,
  canonical_invoice_id uuid REFERENCES invoice(id),
  canonicalization_status text NOT NULL,
  hold_reason text,
  fingerprint text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, source_provider, external_id)
);

CREATE INDEX idx_imported_invoice_snapshot_provider
  ON imported_invoice_snapshot (tenant_id, source_provider, last_imported_at DESC);

CREATE INDEX idx_imported_invoice_snapshot_canonicalization
  ON imported_invoice_snapshot (tenant_id, canonicalization_status, hold_reason);
