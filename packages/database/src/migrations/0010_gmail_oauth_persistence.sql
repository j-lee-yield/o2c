ALTER TABLE sending_identity
  ADD COLUMN owner_principal_id text,
  ADD COLUMN owner_principal_roles jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE gmail_oauth_connection (
  sender_identity_id uuid PRIMARY KEY REFERENCES sending_identity(id),
  tenant_id text NOT NULL DEFAULT 'default',
  sender_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  access_token_expires_at timestamptz NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_name text,
  connected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  requested_by_principal_id text,
  requested_by_principal_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sending_identity_owner
  ON sending_identity (tenant_id, owner_principal_id, updated_at DESC);

CREATE INDEX idx_gmail_oauth_connection_tenant_email
  ON gmail_oauth_connection (tenant_id, sender_email, updated_at DESC);
