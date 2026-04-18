CREATE TABLE IF NOT EXISTS perfios_raw_statement_payload (
  raw_payload_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  source_provider text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perfios_raw_statement_payload_tenant_received
  ON perfios_raw_statement_payload (tenant_id, received_at DESC);

CREATE TABLE IF NOT EXISTS perfios_normalized_statement (
  statement_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  document_id text NOT NULL,
  raw_payload_id text NOT NULL REFERENCES perfios_raw_statement_payload(raw_payload_id),
  bank_name text,
  account_name text,
  account_number_masked text,
  statement_period_start date,
  statement_period_end date,
  currency text,
  source_provider text NOT NULL,
  parser_confidence double precision NOT NULL,
  parser_confidence_level text NOT NULL,
  reconciliation_ready boolean NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perfios_normalized_statement_tenant_created
  ON perfios_normalized_statement (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS perfios_normalized_transaction (
  transaction_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  statement_id text NOT NULL REFERENCES perfios_normalized_statement(statement_id),
  external_transaction_id text,
  date date NOT NULL,
  cheque_number text,
  description text NOT NULL,
  amount bigint NOT NULL,
  balance bigint,
  category text,
  inferred_direction text NOT NULL,
  parser_confidence double precision NOT NULL,
  parser_confidence_level text NOT NULL,
  source_page integer,
  source_row integer,
  duplicate_flag boolean NOT NULL,
  human_corrected_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  automation_eligibility text NOT NULL,
  reconciliation_ready boolean NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perfios_normalized_transaction_statement
  ON perfios_normalized_transaction (statement_id, date DESC, source_row ASC);

CREATE INDEX IF NOT EXISTS idx_perfios_normalized_transaction_tenant_review
  ON perfios_normalized_transaction (tenant_id, reconciliation_ready, duplicate_flag, parser_confidence_level);
