-- Locations table: first-class entity for office/branch locations
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  google_review_url TEXT,
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, name, is_test)
);

CREATE INDEX IF NOT EXISTS idx_locations_client_test ON locations(client_id, is_test);

-- Add location_id FK to communities
ALTER TABLE communities ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_communities_location ON communities(location_id);

-- Backfill: create locations from existing management_company data on users
INSERT INTO locations (client_id, name, is_test)
SELECT DISTINCT u.client_id, u.management_company, u.is_test
FROM users u
WHERE u.management_company IS NOT NULL AND TRIM(u.management_company) != ''
ON CONFLICT (client_id, name, is_test) DO NOTHING;

-- Backfill: link communities to locations via their members' most common management_company
UPDATE communities c
SET location_id = sub.location_id
FROM (
  SELECT DISTINCT ON (u.community_id)
    u.community_id,
    l.id as location_id
  FROM users u
  JOIN locations l ON l.name = u.management_company AND l.client_id = u.client_id AND l.is_test = u.is_test
  WHERE u.community_id IS NOT NULL
    AND u.management_company IS NOT NULL
    AND TRIM(u.management_company) != ''
  GROUP BY u.community_id, l.id
  ORDER BY u.community_id, COUNT(*) DESC
) sub
WHERE c.id = sub.community_id AND c.location_id IS NULL;
