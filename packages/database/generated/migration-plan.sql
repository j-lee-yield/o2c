-- 0001_core_domain_schema.sql
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

-- 0001_init.sql
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 0002_canonical_entity_metadata_and_payment_applications.sql
CREATE TYPE payment_application_state AS ENUM (
  'proposed',
  'applied',
  'reversed'
);

ALTER TABLE parent_account
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE branch
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE billing_account
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE contact
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE uploaded_document
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE invoice
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE payment
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

CREATE TABLE payment_application (
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
  payment_id uuid NOT NULL REFERENCES payment(id),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  currency text NOT NULL,
  applied_amount_cents bigint NOT NULL CHECK (applied_amount_cents > 0),
  state payment_application_state NOT NULL,
  source text NOT NULL,
  correlation_id text,
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE remittance
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE promise_to_pay
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE exception
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE activity_log
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

ALTER TABLE approval_request
  ADD COLUMN tenant_id text NOT NULL DEFAULT 'default',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN created_by_actor_id text,
  ADD COLUMN created_by_actor_role text,
  ADD COLUMN updated_by_actor_id text,
  ADD COLUMN updated_by_actor_role text;

-- 0003_imported_invoice_snapshots.sql
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

-- 0004_learning_layer_foundation.sql
CREATE TABLE learning_event (
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
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  contact_id uuid REFERENCES contact(id),
  event_type text NOT NULL,
  source_system text NOT NULL,
  source_event_id text,
  occurred_at timestamptz NOT NULL,
  channel text,
  provider text,
  direction text,
  intent_type text,
  communication_status text,
  related_entity_type text,
  related_entity_id text,
  invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_id uuid REFERENCES payment(id),
  remittance_id uuid REFERENCES remittance(id),
  promise_to_pay_id uuid REFERENCES promise_to_pay(id),
  exception_id uuid REFERENCES exception(id),
  approval_request_id uuid REFERENCES approval_request(id),
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversible boolean NOT NULL DEFAULT true,
  reversed_at timestamptz,
  reversal_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE account_behavior_profile (
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
  scope text NOT NULL,
  scope_id text NOT NULL,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  preferred_channel text,
  fallback_channel text,
  channel_priority_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_channel_by_intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_by_channel jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, scope, scope_id)
);

CREATE TABLE contact_behavior_profile (
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
  contact_id uuid NOT NULL REFERENCES contact(id),
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  preferred_channel text,
  fallback_channel text,
  channel_priority_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_channel_by_intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_by_channel jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, contact_id)
);

CREATE TABLE next_best_action_score (
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
  domain text NOT NULL,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  contact_id uuid REFERENCES contact(id),
  recommended_action text NOT NULL,
  recommended_channel text,
  intent_type text,
  score double precision NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  hard_safety_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_profile_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  scored_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE operator_feedback (
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
  feedback_type text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  parent_account_id uuid REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  contact_id uuid REFERENCES contact(id),
  linked_learning_event_id uuid REFERENCES learning_event(id),
  linked_next_best_action_score_id uuid REFERENCES next_best_action_score(id),
  reason_code text NOT NULL,
  comment text,
  before_payload jsonb,
  after_payload jsonb,
  applies_to_future_scoring boolean NOT NULL DEFAULT false,
  preserves_safety_rules boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_learning_event_tenant_occurred_at
  ON learning_event (tenant_id, occurred_at DESC);

CREATE INDEX idx_learning_event_account_channel
  ON learning_event (tenant_id, parent_account_id, billing_account_id, channel, intent_type);

CREATE INDEX idx_account_behavior_profile_scope
  ON account_behavior_profile (tenant_id, scope, scope_id);

CREATE INDEX idx_contact_behavior_profile_contact
  ON contact_behavior_profile (tenant_id, contact_id);

CREATE INDEX idx_operator_feedback_target
  ON operator_feedback (tenant_id, target_type, target_id, occurred_at DESC);

CREATE INDEX idx_next_best_action_score_domain
  ON next_best_action_score (tenant_id, domain, scored_at DESC);

-- 0005_multichannel_communication_foundation.sql
CREATE TABLE communication_attempt (
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
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  contact_id uuid REFERENCES contact(id),
  approval_request_id uuid REFERENCES approval_request(id),
  channel text NOT NULL,
  provider text NOT NULL,
  direction text NOT NULL,
  intent_type text NOT NULL,
  status text NOT NULL,
  recipient jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject_line text,
  content_template_key text,
  body_preview text,
  provider_message_id text,
  blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE channel_behavior_profile (
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
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  contact_id uuid REFERENCES contact(id),
  channel text NOT NULL,
  response_rate double precision NOT NULL DEFAULT 0,
  avg_response_latency_hours double precision,
  payment_conversion_rate double precision NOT NULL DEFAULT 0,
  ptp_capture_rate double precision NOT NULL DEFAULT 0,
  ptp_kept_rate double precision NOT NULL DEFAULT 0,
  wrong_contact_rate double precision NOT NULL DEFAULT 0,
  doc_request_rate double precision NOT NULL DEFAULT 0,
  opt_out_rate double precision NOT NULL DEFAULT 0,
  connect_rate double precision NOT NULL DEFAULT 0,
  voicemail_rate double precision NOT NULL DEFAULT 0,
  right_party_contact_rate double precision NOT NULL DEFAULT 0,
  best_for_intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at timestamptz NOT NULL,
  evidence_count integer NOT NULL DEFAULT 0,
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, owner_type, owner_id, channel)
);

CREATE TABLE email_outcome (
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
  communication_attempt_id uuid NOT NULL REFERENCES communication_attempt(id),
  delivered boolean NOT NULL DEFAULT false,
  opened boolean NOT NULL DEFAULT false,
  replied boolean NOT NULL DEFAULT false,
  bounced boolean NOT NULL DEFAULT false,
  link_clicked boolean NOT NULL DEFAULT false,
  attachments_sent jsonb NOT NULL DEFAULT '[]'::jsonb,
  docs_requested boolean NOT NULL DEFAULT false,
  extracted_ptp jsonb,
  extracted_remittance_signal boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE sms_outcome (
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
  communication_attempt_id uuid NOT NULL REFERENCES communication_attempt(id),
  delivered boolean NOT NULL DEFAULT false,
  replied boolean NOT NULL DEFAULT false,
  clicked boolean NOT NULL DEFAULT false,
  opt_out_received boolean NOT NULL DEFAULT false,
  extracted_ptp jsonb,
  extracted_remittance_signal boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE call_outcome (
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
  communication_attempt_id uuid NOT NULL REFERENCES communication_attempt(id),
  answered boolean NOT NULL DEFAULT false,
  duration_seconds integer,
  disposition text NOT NULL,
  promised_amount_cents bigint,
  promised_date date,
  transcript_uri text,
  transcript_summary text,
  transcript_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sentiment_label text,
  operator_review_required boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_communication_attempt_tenant_channel
  ON communication_attempt (tenant_id, channel, status, created_at DESC);

CREATE INDEX idx_communication_attempt_account
  ON communication_attempt (tenant_id, parent_account_id, billing_account_id, contact_id);

CREATE INDEX idx_channel_behavior_profile_owner
  ON channel_behavior_profile (tenant_id, owner_type, owner_id, channel);

CREATE INDEX idx_email_outcome_attempt
  ON email_outcome (tenant_id, communication_attempt_id, occurred_at DESC);

CREATE INDEX idx_sms_outcome_attempt
  ON sms_outcome (tenant_id, communication_attempt_id, occurred_at DESC);

CREATE INDEX idx_call_outcome_attempt
  ON call_outcome (tenant_id, communication_attempt_id, occurred_at DESC);

-- 0006_harden_approvals_and_invoice_identity.sql
ALTER TABLE approval_request
  RENAME TO approval_requests;

ALTER INDEX idx_approval_request_entity
  RENAME TO idx_approval_requests_entity;

ALTER TABLE approval_requests
  RENAME COLUMN state TO status;

ALTER TABLE approval_requests
  ADD COLUMN assignee_role text,
  ADD COLUMN current_step text,
  ADD COLUMN terminal_at timestamptz,
  ADD COLUMN reopened_from_status text,
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN policy_context jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE approval_requests
SET
  payload = COALESCE(
    NULLIF(metadata, '{}'::jsonb),
    jsonb_build_object(
      'entityType', entity_type,
      'entityId', entity_id
    )
  ),
  policy_context = COALESCE(metadata->'policyContext', '{}'::jsonb),
  assignee_role = COALESCE(assignee_role, metadata->>'assigneeRole'),
  current_step = COALESCE(current_step, metadata->>'currentStep'),
  terminal_at = COALESCE(
    terminal_at,
    CASE
      WHEN status IN ('approved', 'rejected', 'cancelled')
        THEN resolved_at
      ELSE NULL
    END
  ),
  reopened_from_status = COALESCE(reopened_from_status, metadata->>'reopenedFromStatus');

ALTER TABLE learning_event
  DROP CONSTRAINT IF EXISTS learning_event_approval_request_id_fkey,
  ADD CONSTRAINT learning_event_approval_request_id_fkey
    FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id);

ALTER TABLE communication_attempt
  DROP CONSTRAINT IF EXISTS communication_attempt_approval_request_id_fkey,
  ADD CONSTRAINT communication_attempt_approval_request_id_fkey
    FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id);

ALTER TABLE invoice
  DROP CONSTRAINT IF EXISTS invoice_billing_account_id_invoice_number_key;

ALTER TABLE invoice
  ADD COLUMN seller_entity_id text,
  ADD COLUMN canonical_identity_key text;

UPDATE invoice
SET
  canonical_identity_key = concat_ws(
    ':',
    COALESCE(NULLIF(metadata->>'companyId', ''), parent_account_id::text),
    billing_account_id::text,
    invoice_number,
    COALESCE(metadata->>'invoiceDate', ''),
    amount_cents::text
  ),
  seller_entity_id = COALESCE(NULLIF(metadata->>'companyId', ''), seller_entity_id),
  metadata = jsonb_set(
    metadata,
    '{canonicalIdentityKey}',
    to_jsonb(
      concat_ws(
        ':',
        COALESCE(NULLIF(metadata->>'companyId', ''), parent_account_id::text),
        billing_account_id::text,
        invoice_number,
        COALESCE(metadata->>'invoiceDate', ''),
        amount_cents::text
      )
    ),
    true
  )
WHERE COALESCE(canonical_identity_key, '') = '';

ALTER TABLE invoice
  ALTER COLUMN canonical_identity_key SET NOT NULL,
  ADD CONSTRAINT invoice_canonical_identity_key_unique
    UNIQUE (tenant_id, canonical_identity_key);

-- 0007_runtime_persistence_and_domain_alignment.sql
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

-- 0008_uploaded_document_processing_records.sql
CREATE TABLE IF NOT EXISTS uploaded_document_processing_record (
  document_id uuid PRIMARY KEY REFERENCES uploaded_document(id),
  tenant_id text NOT NULL DEFAULT 'default',
  parser_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  hierarchy jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  erp_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_case jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_review',
  human_confirmed boolean NOT NULL DEFAULT false,
  matched_erp_invoice_id text,
  provisional_invoice jsonb,
  locked_at timestamptz,
  locked_by_actor_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploaded_document_processing_record_tenant_status
  ON uploaded_document_processing_record (tenant_id, status, updated_at DESC);

-- 0009_outbound_email_sending_identity.sql
CREATE TABLE sending_identity (
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
  provider text NOT NULL,
  auth_mode text NOT NULL,
  sender_email text NOT NULL,
  display_name text,
  connection_status text NOT NULL,
  permission_status text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  send_as_email text,
  send_on_behalf_of_email text,
  is_default boolean NOT NULL DEFAULT false,
  allowed_tenant_id text,
  allowed_supplier_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  health_state text NOT NULL DEFAULT 'unknown',
  last_sync_at timestamptz,
  last_send_check_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE email_thread_reference (
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
  communication_attempt_id uuid NOT NULL REFERENCES communication_attempt(id),
  provider text NOT NULL,
  sender_identity_id uuid REFERENCES sending_identity(id),
  billing_account_id uuid REFERENCES billing_account(id),
  contact_id uuid REFERENCES contact(id),
  invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_intent text NOT NULL,
  provider_message_id text,
  provider_thread_id text,
  provider_conversation_id text,
  reply_to_provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE communication_attempt
  ADD COLUMN sender_identity_id uuid REFERENCES sending_identity(id),
  ADD COLUMN sender_email text,
  ADD COLUMN sender_display_name text,
  ADD COLUMN provider_thread_id text,
  ADD COLUMN provider_conversation_id text,
  ADD COLUMN in_reply_to_provider_message_id text;

CREATE INDEX idx_sending_identity_default
  ON sending_identity (tenant_id, is_default, updated_at DESC);

CREATE INDEX idx_email_thread_reference_lookup
  ON email_thread_reference (tenant_id, sender_identity_id, billing_account_id, contact_id, created_at DESC);

CREATE INDEX idx_communication_attempt_sender_identity
  ON communication_attempt (tenant_id, sender_identity_id, created_at DESC);

-- 0010_gmail_oauth_persistence.sql
ALTER TABLE sending_identity
  ADD COLUMN owner_principal_id text,
  ADD COLUMN owner_principal_roles jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE gmail_oauth_connection (
  sender_identity_id uuid PRIMARY KEY REFERENCES sending_identity(id),
  tenant_id text NOT NULL DEFAULT 'default',
  sender_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  access_token_expires_at timestamptz NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name text,
  connected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  requested_by_principal_id text,
  requested_by_principal_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sending_identity_owner
  ON sending_identity (tenant_id, owner_principal_id, updated_at DESC);

CREATE INDEX idx_gmail_oauth_connection_tenant_email
  ON gmail_oauth_connection (tenant_id, sender_email, updated_at DESC);

-- 0011_deductions_workspace.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deduction_case_state') THEN
    CREATE TYPE deduction_case_state AS ENUM (
      'open_new',
      'triaged',
      'gathering_support',
      'credit_memo_draft',
      'approval_pending',
      'sync_pending',
      'synced',
      'rejected',
      'closed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deduction_line_item_status') THEN
    CREATE TYPE deduction_line_item_status AS ENUM (
      'open',
      'under_review',
      'accepted',
      'rejected',
      'credited'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_state') THEN
    CREATE TYPE claim_state AS ENUM (
      'received',
      'validated',
      'needs_support',
      'rejected',
      'resolved'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deduction_document_bundle_state') THEN
    CREATE TYPE deduction_document_bundle_state AS ENUM (
      'missing_documents',
      'partial',
      'complete',
      'submitted'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_memo_draft_state') THEN
    CREATE TYPE credit_memo_draft_state AS ENUM (
      'draft',
      'ready_for_review',
      'approval_pending',
      'approved',
      'sync_pending',
      'synced',
      'sync_failed',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deduction_case (
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
  parent_account_id uuid NOT NULL REFERENCES parent_account(id),
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  invoice_id uuid REFERENCES invoice(id),
  payment_id uuid REFERENCES payment(id),
  exception_id uuid REFERENCES exception(id),
  approval_request_id uuid REFERENCES approval_requests(id),
  external_claim_reference text,
  state deduction_case_state NOT NULL,
  queue_status text NOT NULL,
  reason_code text NOT NULL,
  priority text NOT NULL,
  source_channel text NOT NULL,
  source_job_id text,
  owner_role text,
  detected_at timestamptz NOT NULL,
  opened_at timestamptz NOT NULL,
  target_amount_cents bigint NOT NULL,
  currency text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_deduction_case_tenant_queue
  ON deduction_case (tenant_id, queue_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS claim (
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
  deduction_case_id uuid NOT NULL REFERENCES deduction_case(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoice(id),
  payment_id uuid REFERENCES payment(id),
  exception_id uuid REFERENCES exception(id),
  claim_number text NOT NULL,
  claimant_name text,
  source_channel text NOT NULL,
  asserted_at timestamptz NOT NULL,
  status claim_state NOT NULL,
  asserted_amount_cents bigint NOT NULL,
  currency text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS deduction_line_item (
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
  deduction_case_id uuid NOT NULL REFERENCES deduction_case(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoice(id),
  payment_id uuid REFERENCES payment(id),
  exception_id uuid REFERENCES exception(id),
  claim_id uuid REFERENCES claim(id),
  line_number integer NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  quantity numeric,
  unit_amount_cents bigint,
  disputed_amount_cents bigint NOT NULL,
  accepted_amount_cents bigint,
  status deduction_line_item_status NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS deduction_document_bundle (
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
  deduction_case_id uuid NOT NULL UNIQUE REFERENCES deduction_case(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoice(id),
  payment_id uuid REFERENCES payment(id),
  status deduction_document_bundle_state NOT NULL,
  completeness_score numeric NOT NULL DEFAULT 0,
  missing_document_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS credit_memo_draft (
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
  deduction_case_id uuid NOT NULL UNIQUE REFERENCES deduction_case(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoice(id),
  payment_id uuid REFERENCES payment(id),
  exception_id uuid REFERENCES exception(id),
  approval_request_id uuid REFERENCES approval_requests(id),
  memo_number text,
  state credit_memo_draft_state NOT NULL,
  reason_code text NOT NULL,
  currency text NOT NULL,
  subtotal_amount_cents bigint NOT NULL,
  total_amount_cents bigint NOT NULL,
  last_refreshed_at timestamptz NOT NULL,
  last_synced_at timestamptz,
  erp_sync_status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS credit_memo_draft_line (
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
  credit_memo_draft_id uuid NOT NULL REFERENCES credit_memo_draft(id) ON DELETE CASCADE,
  deduction_line_item_id uuid REFERENCES deduction_line_item(id),
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric,
  unit_amount_cents bigint,
  amount_cents bigint NOT NULL,
  tax_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 0012_perfios_bank_statement_persistence.sql
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

-- 0013_payment_finality_and_withholding.sql
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

-- 0014_quickbooks_oauth_persistence.sql
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

-- 0015_sap_business_one_connection_and_sync.sql
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

-- 0016_control_center_persistence.sql
BEGIN;

CREATE TABLE IF NOT EXISTS control_center_workflow (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sender_identity_id TEXT,
  sender_email TEXT,
  test_email_recipient TEXT,
  test_call_recipient TEXT,
  timezone TEXT NOT NULL,
  outreach_window_start TEXT NOT NULL,
  outreach_window_end TEXT NOT NULL,
  outreach_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekend_calling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stage_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_control_center_workflow_tenant_updated
  ON control_center_workflow (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS control_center_template_folder (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_control_center_template_folder_tenant_name
  ON control_center_template_folder (tenant_id, name);

CREATE TABLE IF NOT EXISTS control_center_email_template (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  name TEXT NOT NULL,
  folder_id TEXT REFERENCES control_center_template_folder(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel_compatibility JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  preview_seed_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_control_center_email_template_tenant_updated
  ON control_center_email_template (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS control_center_stage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  workflow_id TEXT NOT NULL REFERENCES control_center_workflow(id) ON DELETE CASCADE,
  stage_order INTEGER NOT NULL,
  outreach_type TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_mode TEXT NOT NULL,
  template_id TEXT REFERENCES control_center_email_template(id) ON DELETE SET NULL,
  ai_strategy_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  risk_hints JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_control_center_stage_workflow_order
  ON control_center_stage (tenant_id, workflow_id, stage_order);

CREATE TABLE IF NOT EXISTS control_center_call_agent_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  phone_number TEXT NOT NULL,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  outbound_calling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  human_support_number TEXT,
  handoff_to_human_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  manual_agent_instructions TEXT NOT NULL DEFAULT '',
  override_opening_line TEXT,
  call_recording_disclaimer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider_type TEXT,
  provider_config_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_behavior_flags JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_control_center_call_agent_config_tenant_updated
  ON control_center_call_agent_config (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS control_center_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT,
  default_timezone TEXT NOT NULL,
  default_sender_behavior TEXT NOT NULL,
  allowed_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  channel_fallback_policy TEXT NOT NULL,
  sandbox_mode TEXT NOT NULL,
  default_risk_approval_mode TEXT NOT NULL,
  seeded_demo_flags JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_control_center_config_tenant_updated
  ON control_center_config (tenant_id, updated_at DESC);

COMMIT;

-- 0017_control_center_template_settings.sql
ALTER TABLE control_center_email_template
ADD COLUMN IF NOT EXISTS cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE control_center_email_template
ADD COLUMN IF NOT EXISTS auto_correct_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 0018_client_connect_invites_and_pull_runs.sql
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
