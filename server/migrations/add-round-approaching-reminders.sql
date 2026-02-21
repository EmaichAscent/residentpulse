-- Admin reminder flags for round approaching notifications
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS admin_reminder_14_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS admin_reminder_0_sent BOOLEAN DEFAULT FALSE;
