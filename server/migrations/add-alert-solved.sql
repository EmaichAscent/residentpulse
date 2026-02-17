-- Add solved state to critical_alerts
ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS solved BOOLEAN DEFAULT FALSE;
ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS solved_by INTEGER REFERENCES client_admins(id);
ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS solved_at TIMESTAMP;
ALTER TABLE critical_alerts ADD COLUMN IF NOT EXISTS solve_note TEXT;
