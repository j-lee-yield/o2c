CREATE TABLE IF NOT EXISTS task_record (
  id text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'default',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  created_by_actor_id text,
  created_by_actor_role text,
  updated_by_actor_id text,
  updated_by_actor_role text,
  title text NOT NULL,
  description text,
  kind text NOT NULL,
  task_type text NOT NULL,
  status text NOT NULL,
  origin text NOT NULL,
  surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_profile_id text,
  billing_account_id text,
  contact_id text,
  branch_id text,
  owner_id text,
  owner_role text,
  owner_team text,
  source text,
  call_id text,
  plan_id text,
  linked_invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text,
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  closed_at timestamptz,
  dismissed_at timestamptz,
  deleted_at timestamptz,
  summary text,
  recommended_next_action text,
  transcript_snippet text,
  requires_human_review boolean,
  source_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  audit_trail jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_task_record_tenant_status_due
  ON task_record (tenant_id, status, due_at, created_at);

CREATE INDEX IF NOT EXISTS idx_task_record_billing_account
  ON task_record (tenant_id, billing_account_id, status);

CREATE INDEX IF NOT EXISTS idx_task_record_customer_profile
  ON task_record (tenant_id, customer_profile_id, status);

CREATE INDEX IF NOT EXISTS idx_task_record_call
  ON task_record (tenant_id, call_id);
