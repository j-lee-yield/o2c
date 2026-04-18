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
