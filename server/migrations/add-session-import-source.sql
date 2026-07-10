-- ══════════════════════════════════════════════════════════════════════
-- Zoho Parity — Phase F: session import provenance
-- ══════════════════════════════════════════════════════════════════════
-- Marks sessions created by the historical importer so re-runs can
-- detect them (idempotency key: client + email + submission date +
-- import_source) and dashboards can distinguish imported history from
-- native chats. NULL = native session (all existing rows).

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS import_source TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_import_source ON sessions(client_id, import_source);
