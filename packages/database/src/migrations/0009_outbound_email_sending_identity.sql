CREATE TABLE sending_identity (
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
  provider text NOT NULL,
  auth_mode text NOT NULL,
  sender_email text NOT NULL,
  display_name text,
  connection_status text NOT NULL,
  permission_status text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  send_as_email text,
  send_on_behalf_of_email text,
  is_default boolean NOT NULL DEFAULT false,
  allowed_tenant_id text,
  allowed_supplier_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  health_state text NOT NULL DEFAULT 'unknown',
  last_sync_at timestamptz,
  last_send_check_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE email_thread_reference (
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
  provider text NOT NULL,
  sender_identity_id uuid REFERENCES sending_identity(id),
  billing_account_id uuid REFERENCES billing_account(id),
  contact_id uuid REFERENCES contact(id),
  invoice_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflow_intent text NOT NULL,
  provider_message_id text,
  provider_thread_id text,
  provider_conversation_id text,
  reply_to_provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE communication_attempt
  ADD COLUMN sender_identity_id uuid REFERENCES sending_identity(id),
  ADD COLUMN sender_email text,
  ADD COLUMN sender_display_name text,
  ADD COLUMN provider_thread_id text,
  ADD COLUMN provider_conversation_id text,
  ADD COLUMN in_reply_to_provider_message_id text;

CREATE INDEX idx_sending_identity_default
  ON sending_identity (tenant_id, is_default, updated_at DESC);

CREATE INDEX idx_email_thread_reference_lookup
  ON email_thread_reference (tenant_id, sender_identity_id, billing_account_id, contact_id, created_at DESC);

CREATE INDEX idx_communication_attempt_sender_identity
  ON communication_attempt (tenant_id, sender_identity_id, created_at DESC);
