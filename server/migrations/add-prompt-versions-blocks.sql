-- prompt_versions schema extension for the SuperAdmin Prompts Library
-- redesign (DESIGN/design_handoff_superadmin §4 + §5).
--
-- The existing table stores plain prompt_text per version. We add three
-- columns so the SuperAdmin can:
--
--   1. Render each version as structured blocks ({heading, kind, body})
--      without re-parsing on every read. blocks_jsonb is authoritative
--      when present; nullable rows fall back to parsing prompt_text on
--      demand (back-compat with all rows that existed before this PR).
--
--   2. Attach a freeform note describing why the change was made
--      (e.g. "AI-assisted: tighten thread discipline" or
--      "Manual: drop reserves coverage area"). Surfaces in the
--      version-history list per the handoff §"Recent versions card".
--
--   3. Reference an explicit version_number per prompt_key — auto-
--      incremented in the application layer when a new version is
--      written. Beats relying on created_at ordering for "v3 → v4"
--      diff labels in the UI.
--
-- Backfill strategy: existing rows leave the new columns NULL.
-- Reads that need blocks parse prompt_text on the fly. Reads that
-- need version_number compute it from row order within prompt_key.
--
-- Idempotent. ALTER … ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE prompt_versions
  ADD COLUMN IF NOT EXISTS blocks_jsonb JSONB,
  ADD COLUMN IF NOT EXISTS note         TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER;

-- Index supports: "show me all versions of system_prompt, newest first"
-- (the version history panel) and "what's the highest version_number
-- I've assigned for this key?" (next-version-number computation).
CREATE INDEX IF NOT EXISTS idx_prompt_versions_key_version
  ON prompt_versions (prompt_key, version_number DESC NULLS LAST);
