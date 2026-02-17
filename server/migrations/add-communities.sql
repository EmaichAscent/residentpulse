-- Communities table for paid-tier clients
CREATE TABLE IF NOT EXISTS communities (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  community_name TEXT NOT NULL,
  contract_value NUMERIC,
  community_manager_name TEXT,
  property_type TEXT CHECK(property_type IN ('condo', 'townhome', 'single_family', 'mixed', 'other')),
  number_of_units INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, community_name)
);

-- Add community_id FK to users table (nullable — free tier won't have it)
ALTER TABLE users ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL;
