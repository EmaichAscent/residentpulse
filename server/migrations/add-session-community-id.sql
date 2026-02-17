-- Add community_id to sessions for stable community reference
-- Allows community name corrections to flow through to historical data
-- while preserving which community a response belonged to
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL;

-- Backfill: link existing sessions to communities via user's current community_id
UPDATE sessions s SET community_id = u.community_id
FROM users u
WHERE s.user_id = u.id AND s.community_id IS NULL AND u.community_id IS NOT NULL;
