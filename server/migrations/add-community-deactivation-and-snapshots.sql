-- Community soft-deactivation
ALTER TABLE communities ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;

-- Contract renewal date
ALTER TABLE communities ADD COLUMN IF NOT EXISTS contract_renewal_date DATE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS contract_month_to_month BOOLEAN NOT NULL DEFAULT FALSE;

-- Round-community snapshot table (captures community state at round close)
CREATE TABLE IF NOT EXISTS round_community_snapshots (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES survey_rounds(id) ON DELETE CASCADE,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  community_name TEXT NOT NULL,
  contract_value NUMERIC,
  community_manager_name TEXT,
  property_type TEXT,
  number_of_units INTEGER,
  contract_renewal_date DATE,
  contract_month_to_month BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, community_id)
);
