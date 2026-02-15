-- Survey Rounds table
CREATE TABLE IF NOT EXISTS survey_rounds (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'concluded')),
  scheduled_date DATE NOT NULL,
  launched_at TIMESTAMP,
  closes_at TIMESTAMP,
  concluded_at TIMESTAMP,
  reminder_10_sent BOOLEAN DEFAULT FALSE,
  reminder_20_sent BOOLEAN DEFAULT FALSE,
  members_invited INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_survey_rounds_client_id ON survey_rounds(client_id);
CREATE INDEX IF NOT EXISTS idx_survey_rounds_status ON survey_rounds(status);

-- Add round_id to invitation_logs (nullable for backward compat)
ALTER TABLE invitation_logs ADD COLUMN IF NOT EXISTS round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invitation_logs_round_id ON invitation_logs(round_id);

-- Add round_id to sessions (nullable for backward compat)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_round_id ON sessions(round_id);
