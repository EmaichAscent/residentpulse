-- Compound indexes for scalability at 100+ communities / 1000+ members
-- Sessions: most dashboard queries filter by these 3 columns together
CREATE INDEX IF NOT EXISTS idx_sessions_round_client_test ON sessions (round_id, client_id, is_test);
CREATE INDEX IF NOT EXISTS idx_sessions_client_test_completed ON sessions (client_id, is_test, completed);

-- Invitation logs: delivery status lookups per user
CREATE INDEX IF NOT EXISTS idx_invitation_logs_user_sent ON invitation_logs (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitation_logs_client_test ON invitation_logs (client_id, is_test, sent_at DESC);

-- Messages: word frequency and session message lookups
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages (session_id, role);

-- Users: community auto-link and import lookups
CREATE INDEX IF NOT EXISTS idx_users_client_test_active ON users (client_id, is_test, active);
CREATE INDEX IF NOT EXISTS idx_users_client_email_test ON users (client_id, LOWER(email), is_test);

-- Communities: client lookups
CREATE INDEX IF NOT EXISTS idx_communities_client_test ON communities (client_id, is_test);
