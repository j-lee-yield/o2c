ALTER TABLE control_center_email_template
ADD COLUMN IF NOT EXISTS cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE control_center_email_template
ADD COLUMN IF NOT EXISTS auto_correct_enabled BOOLEAN NOT NULL DEFAULT TRUE;
