CREATE TYPE invoice_state AS ENUM (
  'uploaded_unmatched',
  'synced_open',
  'matched_to_erp',
  'partially_paid',
  'paid',
  'disputed_partial',
  'disputed_full',
  'credit_pending',
  'writeback_pending',
  'writeback_failed',
  'voided'
);

CREATE TYPE payment_state AS ENUM (
  'ingested_unmatched',
  'candidate_match_found',
  'review_required',
  'auto_applied',
  'manually_applied',
  'partially_applied',
  'unapplied_cash',
  'reversed',
  'writeback_pending',
  'writeback_failed'
);

CREATE TYPE remittance_state AS ENUM (
  'received_unparsed',
  'parsed_structured',
  'linked_to_payment',
  'linked_to_invoice_candidate',
  'review_required',
  'resolved',
  'orphaned'
);

CREATE TYPE promise_to_pay_state AS ENUM (
  'detected_unconfirmed',
  'accepted',
  'due_today',
  'kept',
  'broken',
  'superseded',
  'cancelled'
);

CREATE TYPE exception_state AS ENUM (
  'open_new',
  'triaged',
  'waiting_on_customer',
  'waiting_on_internal',
  'ready_for_resolution',
  'resolved',
  'dismissed'
);

CREATE TABLE parent_account (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  external_reference text,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE branch (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  code text NOT NULL,
  name text NOT NULL,
  region text,
  country_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (parent_account_id, code)
);

CREATE TABLE billing_account (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  branch_id uuid REFERENCES branch(id),
  account_number text NOT NULL,
  display_name text NOT NULL,
  currency text NOT NULL,
  erp_customer_id text,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (parent_account_id, account_number)
);

CREATE TABLE contact (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  full_name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE uploaded_document (
  id uuid PRIMARY KEY,
  document_type text NOT NULL,
  source text NOT NULL,
  storage_key text NOT NULL,
  checksum text NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE invoice (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  uploaded_document_id uuid REFERENCES uploaded_document(id),
  invoice_number text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  due_date date,
  state invoice_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (billing_account_id, invoice_number)
);

CREATE TABLE payment (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  uploaded_document_id uuid REFERENCES uploaded_document(id),
  payment_reference text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  received_at timestamptz NOT NULL,
  state payment_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE remittance (
  id uuid PRIMARY KEY,
  payment_id uuid REFERENCES payment(id),
  uploaded_document_id uuid REFERENCES uploaded_document(id),
  source_channel text NOT NULL,
  raw_payload jsonb,
  state remittance_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE promise_to_pay (
  id uuid PRIMARY KEY,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  contact_id uuid REFERENCES contact(id),
  promised_amount_cents bigint NOT NULL CHECK (promised_amount_cents > 0),
  currency text NOT NULL,
  promise_date date NOT NULL,
  state promise_to_pay_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE exception (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  severity text NOT NULL,
  summary text NOT NULL,
  details text,
  state exception_state NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE activity_log (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  occurred_at timestamptz NOT NULL,
  from_state text,
  to_state text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE approval_request (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  request_type text NOT NULL,
  state text NOT NULL,
  requested_by text NOT NULL,
  approver_id text,
  requested_at timestamptz NOT NULL,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_invoice_state ON invoice(state);
CREATE INDEX idx_payment_state ON payment(state);
CREATE INDEX idx_remittance_state ON remittance(state);
CREATE INDEX idx_promise_to_pay_state ON promise_to_pay(state);
CREATE INDEX idx_exception_state ON exception(state);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_approval_request_entity ON approval_request(entity_type, entity_id);
