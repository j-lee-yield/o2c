ALTER TABLE billing_account
  ADD COLUMN IF NOT EXISTS account_tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS centrally_paid boolean NOT NULL DEFAULT false;

ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoice(id),
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'billing_account',
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_auto_send boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recent_successful_responses integer NOT NULL DEFAULT 0;

UPDATE contact
SET scope_id = COALESCE(
  scope_id,
  billing_account_id::text,
  branch_id::text,
  parent_account_id::text,
  id::text
)
WHERE scope_id IS NULL;

ALTER TABLE contact
  ALTER COLUMN scope_id SET NOT NULL;

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branch(id),
  ADD COLUMN IF NOT EXISTS invoice_contact_id uuid REFERENCES contact(id),
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS collectible_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS disputed_amount_cents bigint;

CREATE TABLE IF NOT EXISTS remittance_processing_record (
  remittance_id uuid PRIMARY KEY REFERENCES remittance(id),
  tenant_id text NOT NULL DEFAULT 'default',
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsed jsonb,
  payment_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  invoice_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_payment_id uuid REFERENCES payment(id),
  review jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remittance_processing_record_tenant
  ON remittance_processing_record (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cash_application_case (
  payment_id uuid PRIMARY KEY REFERENCES payment(id),
  tenant_id text NOT NULL DEFAULT 'default',
  queue_status text NOT NULL,
  account_id uuid NOT NULL REFERENCES billing_account(id),
  account_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  applications jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  method text NOT NULL DEFAULT 'Bank Transfer',
  received_on text NOT NULL,
  review_label text NOT NULL,
  severity_label text NOT NULL,
  footer_tag text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_application_case_tenant_status
  ON cash_application_case (tenant_id, queue_status, updated_at DESC);
