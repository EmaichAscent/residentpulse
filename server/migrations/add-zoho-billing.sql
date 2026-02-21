-- Zoho Subscriptions billing integration
-- Adds new plan tiers, Zoho linking columns, and pending_payment status

-- 1. Add zoho_plan_code to subscription_plans
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS zoho_plan_code TEXT;

-- 2. Add Zoho fields to client_subscriptions
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS zoho_subscription_id TEXT;
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS zoho_customer_id TEXT;
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS custom_member_limit INTEGER;

-- 3. Expand status CHECK to include 'pending_payment'
ALTER TABLE client_subscriptions DROP CONSTRAINT IF EXISTS client_subscriptions_status_check;
ALTER TABLE client_subscriptions ADD CONSTRAINT client_subscriptions_status_check
  CHECK(status IN ('active', 'canceled', 'expired', 'pending_payment'));

-- 4. Deactivate old paid plans (keep for existing clients)
UPDATE subscription_plans SET is_public = FALSE WHERE name IN ('starter', 'professional', 'enterprise');

-- 5. Insert new growth plans
INSERT INTO subscription_plans (name, display_name, member_limit, survey_rounds_per_year, price_cents, is_public, sort_order, zoho_plan_code)
VALUES
  ('growth-100',  'Growth 100',  100,  4, 10000,  TRUE, 2, 'growth-100'),
  ('growth-250',  'Growth 250',  250,  4, 22500,  TRUE, 3, 'growth-250'),
  ('growth-500',  'Growth 500',  500,  4, 40000,  TRUE, 4, 'growth-500'),
  ('growth-1000', 'Growth 1000', 1000, 4, 70000,  TRUE, 5, 'growth-1000'),
  ('growth-2000', 'Growth 2000', 2000, 4, 120000, TRUE, 6, 'growth-2000'),
  ('custom',      'Custom',      0,    4, NULL,    FALSE, 7, NULL)
ON CONFLICT (name) DO NOTHING;

-- 6. Ensure free plan has correct values
UPDATE subscription_plans SET price_cents = 0, sort_order = 1, is_public = TRUE WHERE name = 'free';

-- 7. Index for fast Zoho webhook lookups
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_zoho_sub_id
  ON client_subscriptions(zoho_subscription_id) WHERE zoho_subscription_id IS NOT NULL;
