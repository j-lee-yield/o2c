BEGIN;

CREATE TABLE IF NOT EXISTS control_center_workflow_execution (
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
  billing_account_id UUID NOT NULL REFERENCES billing_account(id) ON DELETE CASCADE,
  parent_account_id UUID NOT NULL REFERENCES parent_account(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  current_track TEXT NOT NULL,
  last_decision_action TEXT,
  last_decision_reason TEXT,
  last_decision_confidence DOUBLE PRECISION,
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  effective_until TIMESTAMPTZ,
  rationale_summary TEXT,
  reasoning_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, workflow_id, billing_account_id)
);

CREATE INDEX IF NOT EXISTS idx_control_center_workflow_execution_workflow
  ON control_center_workflow_execution (tenant_id, workflow_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_control_center_workflow_execution_billing_account
  ON control_center_workflow_execution (tenant_id, billing_account_id, updated_at DESC);

COMMIT;
