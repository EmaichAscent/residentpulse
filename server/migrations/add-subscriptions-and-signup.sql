-- Subscription plans table (tier definitions)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  member_limit INTEGER NOT NULL,
  survey_rounds_per_year INTEGER NOT NULL,
  price_cents INTEGER,
  is_public BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Client subscriptions (one per client)
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'canceled', 'expired')),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id ON client_subscriptions(plan_id);

-- Add survey cadence column (client chooses 2 or 4 rounds per year)
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS survey_cadence INTEGER NOT NULL DEFAULT 2 CHECK(survey_cadence IN (2, 4));

-- Email verification columns on client_admins
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP;

-- Extend clients.status to allow 'pending'
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check CHECK(status IN ('active', 'inactive', 'pending'));

-- Seed subscription plans
INSERT INTO subscription_plans (name, display_name, member_limit, survey_rounds_per_year, price_cents, is_public, sort_order)
VALUES
  ('free', 'Free', 25, 2, NULL, TRUE, 1),
  ('starter', 'Starter', 500, 4, NULL, TRUE, 2),
  ('professional', 'Professional', 1000, 4, NULL, TRUE, 3),
  ('enterprise', 'Enterprise', 2500, 4, NULL, TRUE, 4)
ON CONFLICT (name) DO NOTHING;
