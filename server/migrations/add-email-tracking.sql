-- Add Resend email tracking columns to invitation_logs
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS resend_email_id TEXT;
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent';
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMP;
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS bounce_type TEXT;
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL;

-- Index for webhook lookups by Resend email ID
CREATE INDEX IF NOT EXISTS idx_invitation_logs_resend_id ON invitation_logs(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_invitation_logs_round_id ON invitation_logs(round_id);
