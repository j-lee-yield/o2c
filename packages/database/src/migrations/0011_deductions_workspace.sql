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
