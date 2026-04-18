ALTER TABLE approval_request
  RENAME TO approval_requests;

ALTER INDEX idx_approval_request_entity
  RENAME TO idx_approval_requests_entity;

ALTER TABLE approval_requests
  RENAME COLUMN state TO status;

ALTER TABLE approval_requests
  ADD COLUMN assignee_role text,
  ADD COLUMN current_step text,
  ADD COLUMN terminal_at timestamptz,
  ADD COLUMN reopened_from_status text,
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN policy_context jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE approval_requests
SET
  payload = COALESCE(
    NULLIF(metadata, '{}'::jsonb),
    jsonb_build_object(
      'entityType', entity_type,
      'entityId', entity_id
    )
  ),
  policy_context = COALESCE(metadata->'policyContext', '{}'::jsonb),
  assignee_role = COALESCE(assignee_role, metadata->>'assigneeRole'),
  current_step = COALESCE(current_step, metadata->>'currentStep'),
  terminal_at = COALESCE(
    terminal_at,
    CASE
      WHEN status IN ('approved', 'rejected', 'cancelled')
        THEN resolved_at
      ELSE NULL
    END
  ),
  reopened_from_status = COALESCE(reopened_from_status, metadata->>'reopenedFromStatus');

ALTER TABLE learning_event
  DROP CONSTRAINT IF EXISTS learning_event_approval_request_id_fkey,
  ADD CONSTRAINT learning_event_approval_request_id_fkey
    FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id);

ALTER TABLE communication_attempt
  DROP CONSTRAINT IF EXISTS communication_attempt_approval_request_id_fkey,
  ADD CONSTRAINT communication_attempt_approval_request_id_fkey
    FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id);

ALTER TABLE invoice
  DROP CONSTRAINT IF EXISTS invoice_billing_account_id_invoice_number_key;

ALTER TABLE invoice
  ADD COLUMN seller_entity_id text,
  ADD COLUMN canonical_identity_key text;

UPDATE invoice
SET
  canonical_identity_key = concat_ws(
    ':',
    COALESCE(NULLIF(metadata->>'companyId', ''), parent_account_id::text),
    billing_account_id::text,
    invoice_number,
    COALESCE(metadata->>'invoiceDate', ''),
    amount_cents::text
  ),
  seller_entity_id = COALESCE(NULLIF(metadata->>'companyId', ''), seller_entity_id),
  metadata = jsonb_set(
    metadata,
    '{canonicalIdentityKey}',
    to_jsonb(
      concat_ws(
        ':',
        COALESCE(NULLIF(metadata->>'companyId', ''), parent_account_id::text),
        billing_account_id::text,
        invoice_number,
        COALESCE(metadata->>'invoiceDate', ''),
        amount_cents::text
      )
    ),
    true
  )
WHERE COALESCE(canonical_identity_key, '') = '';

ALTER TABLE invoice
  ALTER COLUMN canonical_identity_key SET NOT NULL,
  ADD CONSTRAINT invoice_canonical_identity_key_unique
    UNIQUE (tenant_id, canonical_identity_key);
