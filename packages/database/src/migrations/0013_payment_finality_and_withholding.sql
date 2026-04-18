ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS settlement_status text,
  ADD COLUMN IF NOT EXISTS source_payment_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS finality_confirmed_at timestamptz;

ALTER TABLE perfios_normalized_transaction
  ADD COLUMN IF NOT EXISTS duplicate_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS candidate_payment_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settlement_hint text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'pending_source_confirmation',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'none';

UPDATE perfios_normalized_transaction
SET duplicate_status = CASE
      WHEN duplicate_flag THEN 'suspected_duplicate'
      ELSE 'unique'
    END,
    candidate_payment_flag = CASE
      WHEN inferred_direction = 'credit' AND NOT duplicate_flag THEN TRUE
      ELSE FALSE
    END,
    settlement_hint = CASE
      WHEN cheque_number IS NOT NULL OR description ILIKE '%check%' OR description ILIKE '%cheque%' THEN 'check'
      WHEN description ILIKE '%transfer%' OR description ILIKE '%fund transfer%' THEN 'transfer'
      ELSE 'instant'
    END,
    settlement_status = CASE
      WHEN cheque_number IS NOT NULL OR description ILIKE '%check%' OR description ILIKE '%cheque%' THEN 'pending_clearance'
      ELSE 'settled'
    END,
    review_status = CASE
      WHEN duplicate_flag OR parser_confidence_level = 'low' THEN 'needs_review'
      ELSE 'none'
    END
WHERE duplicate_status = 'unknown'
   OR settlement_status = 'pending_source_confirmation'
   OR settlement_hint = 'unknown';

CREATE TABLE IF NOT EXISTS payment_candidate (
  payment_candidate_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  statement_id text NOT NULL REFERENCES perfios_normalized_statement(statement_id),
  source_bank_transaction_ids jsonb NOT NULL,
  customer_profile_id uuid NULL,
  inferred_customer_profile_id uuid NULL,
  payer_name text NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  payment_reference text NULL,
  settlement_hint text NOT NULL,
  settlement_status text NOT NULL,
  confidence_score double precision NULL,
  confidence_band text NOT NULL,
  review_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_candidate_tenant_status
  ON payment_candidate (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS withholding_component (
  withholding_component_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  payment_id uuid NOT NULL REFERENCES payment(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  withholding_type text NOT NULL,
  withholding_rate_bps integer NULL,
  withholding_amount_minor bigint NOT NULL,
  evidence_status text NOT NULL,
  bir_form_2307_document_id uuid NULL REFERENCES uploaded_document(id),
  recognized_for_invoice_closure boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS buyer_tax_profile (
  buyer_tax_profile_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_profile_id uuid NULL,
  is_top_withholding_agent boolean NULL,
  withholding_default_type text NOT NULL,
  default_withholding_rate_bps integer NULL,
  requires_2307_for_closure boolean NOT NULL DEFAULT true,
  historical_withholding_behavior_score double precision NULL,
  notes text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_residual_action (
  residual_action_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  payment_id uuid NOT NULL REFERENCES payment(id),
  invoice_id uuid NULL REFERENCES invoice(id),
  residual_type text NOT NULL,
  amount_minor bigint NOT NULL,
  reason_code text NOT NULL,
  requires_approval boolean NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
