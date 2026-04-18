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
