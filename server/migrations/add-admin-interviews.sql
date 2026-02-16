-- Admin Interviews: AI-powered onboarding interviews for client admins
CREATE TABLE IF NOT EXISTS admin_interviews (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  admin_id INTEGER NOT NULL REFERENCES client_admins(id) ON DELETE CASCADE,
  interview_type TEXT NOT NULL DEFAULT 'initial' CHECK(interview_type IN ('initial', 're_interview')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'abandoned')),
  company_size TEXT,
  years_in_business TEXT,
  geographic_area TEXT,
  communities_managed INTEGER,
  competitive_advantages TEXT,
  generated_prompt TEXT,
  interview_summary TEXT,
  admin_confirmed BOOLEAN DEFAULT FALSE,
  previous_interview_id INTEGER REFERENCES admin_interviews(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Interview messages (separate from board member chat messages)
CREATE TABLE IF NOT EXISTS admin_interview_messages (
  id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES admin_interviews(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity log for global audit trail
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('superadmin', 'client_admin', 'system')),
  actor_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Public-facing client identifier (6-char alphanumeric)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_code TEXT;

-- Backfill existing clients without a code
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INT;
BEGIN
  FOR r IN SELECT id FROM clients WHERE client_code IS NULL LOOP
    LOOP
      new_code := '';
      FOR i IN 1..6 LOOP
        new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM clients WHERE client_code = new_code);
    END LOOP;
    UPDATE clients SET client_code = new_code WHERE id = r.id;
  END LOOP;
END $$;

-- Now add the unique constraint (after backfill ensures no NULLs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_client_code_key') THEN
    ALTER TABLE clients ADD CONSTRAINT clients_client_code_key UNIQUE (client_code);
  END IF;
  -- Also set NOT NULL if not already
  ALTER TABLE clients ALTER COLUMN client_code SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Column might already have the constraint
  NULL;
END $$;

-- Track onboarding completion and last login on client_admins
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_interviews_client_id ON admin_interviews(client_id);
CREATE INDEX IF NOT EXISTS idx_admin_interviews_admin_id ON admin_interviews(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_interview_messages_interview_id ON admin_interview_messages(interview_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_client_id ON activity_log(client_id);
