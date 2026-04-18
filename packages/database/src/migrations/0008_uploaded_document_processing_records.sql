CREATE TABLE IF NOT EXISTS uploaded_document_processing_record (
  document_id uuid PRIMARY KEY REFERENCES uploaded_document(id),
  tenant_id text NOT NULL DEFAULT 'default',
  parser_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  hierarchy jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  erp_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_case jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_review',
  human_confirmed boolean NOT NULL DEFAULT false,
  matched_erp_invoice_id text,
  provisional_invoice jsonb,
  locked_at timestamptz,
  locked_by_actor_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploaded_document_processing_record_tenant_status
  ON uploaded_document_processing_record (tenant_id, status, updated_at DESC);
