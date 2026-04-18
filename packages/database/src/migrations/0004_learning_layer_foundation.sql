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
