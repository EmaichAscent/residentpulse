-- Subscription management: upgrade/downgrade/cancel support

-- 1. Track pending cancellation (cancel at end of billing period)
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- 2. Track current billing period end date
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;
