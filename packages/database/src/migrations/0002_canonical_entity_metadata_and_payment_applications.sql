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
