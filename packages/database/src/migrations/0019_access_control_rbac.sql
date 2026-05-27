BEGIN;

CREATE TABLE IF NOT EXISTS access_control_user (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_control_user_tenant_email
  ON access_control_user (tenant_id, lower(email));

CREATE TABLE IF NOT EXISTS access_control_role (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_control_role_tenant_key
  ON access_control_role (COALESCE(tenant_id, '__system__'), key);

CREATE TABLE IF NOT EXISTS access_control_permission (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT
);

CREATE TABLE IF NOT EXISTS access_control_role_permission (
  role_id TEXT NOT NULL REFERENCES access_control_role(id),
  permission_id TEXT NOT NULL REFERENCES access_control_permission(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_role_assignment (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES access_control_user(id),
  role_id TEXT NOT NULL REFERENCES access_control_role(id),
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  granted_by_user_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_role_assignment_user_scope
  ON user_role_assignment (user_id, scope_type, scope_id);

CREATE TABLE IF NOT EXISTS approval_authority (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT REFERENCES access_control_user(id),
  role_id TEXT REFERENCES access_control_role(id),
  approval_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  granted_by_user_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by_actor_id TEXT,
  created_by_actor_role TEXT,
  updated_by_actor_id TEXT,
  updated_by_actor_role TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_authority_user_scope
  ON approval_authority (user_id, approval_type, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_approval_authority_role_scope
  ON approval_authority (role_id, approval_type, scope_type, scope_id);

COMMIT;
