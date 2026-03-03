-- Add is_mock flag to sessions for SuperAdmin test surveys
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_mock BOOLEAN DEFAULT FALSE;

-- Index for efficient filtering in analytics queries
CREATE INDEX IF NOT EXISTS idx_sessions_is_mock ON sessions(is_mock) WHERE is_mock = TRUE;
