CREATE TYPE installment_plan_status AS ENUM (
  'active',
  'completed',
  'defaulted',
  'restructured',
  'cancelled'
);

CREATE TYPE installment_cadence AS ENUM (
  'weekly',
  'monthly',
  'quarterly',
  'custom'
);

CREATE TYPE installment_line_status AS ENUM (
  'future',
  'due',
  'partially_paid',
  'overdue',
  'promised',
  'disputed',
  'paid',
  'restructured'
);

CREATE TABLE installment_plan (
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
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  parent_invoice_id uuid REFERENCES invoice(id),
  erp_reference text,
  currency text NOT NULL,
  total_contract_amount_cents bigint NOT NULL,
  number_of_installments integer NOT NULL,
  cadence installment_cadence NOT NULL,
  plan_start_date date NOT NULL,
  state installment_plan_status NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE installment_line (
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
  installment_plan_id uuid NOT NULL REFERENCES installment_plan(id),
  parent_invoice_id uuid REFERENCES invoice(id),
  billing_account_id uuid NOT NULL REFERENCES billing_account(id),
  branch_id uuid REFERENCES branch(id),
  currency text NOT NULL,
  sequence_number integer NOT NULL,
  due_date date NOT NULL,
  scheduled_amount_cents bigint NOT NULL,
  paid_amount_cents bigint NOT NULL DEFAULT 0,
  remaining_amount_cents bigint NOT NULL,
  state installment_line_status NOT NULL,
  days_past_due integer NOT NULL DEFAULT 0,
  last_promise_to_pay_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE payment_application
  ADD COLUMN installment_plan_id uuid REFERENCES installment_plan(id),
  ADD COLUMN installment_line_id uuid REFERENCES installment_line(id);

ALTER TABLE promise_to_pay
  ADD COLUMN installment_line_ids jsonb;

CREATE INDEX idx_installment_plan_billing_account
  ON installment_plan (tenant_id, billing_account_id, state);

CREATE INDEX idx_installment_line_plan_due
  ON installment_line (tenant_id, installment_plan_id, due_date, state);
