-- Dashboard Redesign: Round-level insights + critical alerts

-- Add insights and word frequency columns to survey_rounds
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS insights_json JSONB;
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMP;
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS word_frequencies JSONB;

-- Critical alerts table
CREATE TABLE IF NOT EXISTS critical_alerts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('contract_termination', 'legal_threat', 'safety_concern', 'other_critical')),
  severity TEXT NOT NULL DEFAULT 'high' CHECK(severity IN ('high', 'critical')),
  description TEXT NOT NULL,
  source_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_by INTEGER REFERENCES client_admins(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMP,
  dismiss_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_critical_alerts_client_id ON critical_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_round_id ON critical_alerts(round_id);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_dismissed ON critical_alerts(client_id, dismissed);
