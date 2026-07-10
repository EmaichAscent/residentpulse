-- ══════════════════════════════════════════════════════════════════════
-- Zoho Parity — Phase G: viewer role for client admins
-- ══════════════════════════════════════════════════════════════════════
-- Two tiers of client login:
--   'admin'  — today's behavior, full read/write (default, back-compat)
--   'viewer' — dashboards and data only. Every non-GET request under
--              /api/admin is rejected server-side (403); the UI shows
--              a view-only banner and hides mutation affordances.
--
-- The concierge model needs this: CAM staff run the surveys, the
-- client's leadership gets a login that can LOOK at everything and
-- change nothing.

ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

-- CHECK constraint added idempotently (constraint DDL has no IF NOT
-- EXISTS; same drop-then-add pattern as add-zoho-billing.sql).
ALTER TABLE client_admins DROP CONSTRAINT IF EXISTS client_admins_role_check;
ALTER TABLE client_admins ADD CONSTRAINT client_admins_role_check CHECK (role IN ('admin', 'viewer'));
