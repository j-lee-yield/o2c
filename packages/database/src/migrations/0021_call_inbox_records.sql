CREATE TABLE IF NOT EXISTS call_inbox_record (
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'default',
  provider text NOT NULL,
  provider_call_id text NOT NULL,
  communication_attempt_id text,
  pre_call_plan_id text,
  parent_account_id text,
  billing_account_id text,
  branch_id text,
  contact_id text,
  customer_name text NOT NULL,
  customer_phone text,
  from_number text,
  to_number text,
  direction text NOT NULL,
  status text NOT NULL,
  provider_status text,
  disposition text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  voicemail boolean NOT NULL DEFAULT false,
  sentiment text NOT NULL DEFAULT 'unknown',
  classifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_id text,
  workflow_name text,
  requested_by text,
  approver_id text,
  approver_name text,
  invoice_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  transcript_uri text,
  transcript_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  recording_url text,
  recording_expires_at timestamptz,
  public_log_url text,
  task_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_tasks_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_provider_payload jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, provider, provider_call_id)
);

CREATE INDEX IF NOT EXISTS idx_call_inbox_record_tenant_started
  ON call_inbox_record (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_inbox_record_customer
  ON call_inbox_record (tenant_id, customer_name);

CREATE INDEX IF NOT EXISTS idx_call_inbox_record_direction
  ON call_inbox_record (tenant_id, direction, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_inbox_record_billing_account
  ON call_inbox_record (tenant_id, billing_account_id, started_at DESC);
