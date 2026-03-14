-- Test Mode (Sandbox) feature
-- Adds is_test flag to all tenant-scoped tables for data isolation
-- Controlled by FEATURE_TEST_MODE env var; columns are harmless when feature is off

-- Add is_test to tenant-scoped tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- Track when test mode was first activated per client
ALTER TABLE clients ADD COLUMN IF NOT EXISTS test_mode_activated_at TIMESTAMP;

-- Track admin's current mode and whether they've confirmed the go-live flow
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS current_mode TEXT DEFAULT 'live';
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS first_live_switch_confirmed BOOLEAN DEFAULT FALSE;

-- Composite indexes for efficient mode-filtered queries
CREATE INDEX IF NOT EXISTS idx_users_client_test ON users(client_id, is_test);
CREATE INDEX IF NOT EXISTS idx_communities_client_test ON communities(client_id, is_test);
CREATE INDEX IF NOT EXISTS idx_sessions_client_test ON sessions(client_id, is_test);
CREATE INDEX IF NOT EXISTS idx_survey_rounds_client_test ON survey_rounds(client_id, is_test);
