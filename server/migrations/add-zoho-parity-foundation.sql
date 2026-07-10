-- ══════════════════════════════════════════════════════════════════════
-- Zoho Parity — Phase A: schema foundation
-- ══════════════════════════════════════════════════════════════════════
-- All-additive. Nothing existing is renamed, dropped, or altered in
-- place. Existing chat flow is untouched — these tables carry no
-- behavior until Phase C (builder) and Phase D (hybrid chat runtime)
-- start writing to them. Safe to run against production.
--
-- Design doc: docs/ZOHO_PARITY_PLAN.md
-- ══════════════════════════════════════════════════════════════════════

-- ── People being rated ───────────────────────────────────────────────
-- Promoted from communities.community_manager_name (a bare string) so
-- dashboards can roll up per person: "Debbie's book averages 4.2".
-- The string column stays for back-compat; Phase B backfills these
-- tables from distinct names and links the FKs below.

CREATE TABLE IF NOT EXISTS managers (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, name, is_test)
);

CREATE INDEX IF NOT EXISTS idx_managers_client ON managers(client_id, is_test);

CREATE TABLE IF NOT EXISTS bookkeepers (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, name, is_test)
);

CREATE INDEX IF NOT EXISTS idx_bookkeepers_client ON bookkeepers(client_id, is_test);

ALTER TABLE communities ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES managers(id) ON DELETE SET NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS bookkeeper_id INTEGER REFERENCES bookkeepers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_communities_manager ON communities(manager_id);
CREATE INDEX IF NOT EXISTS idx_communities_bookkeeper ON communities(bookkeeper_id);

-- ── Question catalog (shared library) ────────────────────────────────
-- One identity per question across ALL templates and clients. Same
-- question asked by two clients yields comparable data → portfolio
-- benchmarking. `code` is permanent and entity-prefixed (C/M/F/Y).
--
-- Format lock: the app layer rejects answer_format / format_config
-- changes once survey_answers rows exist for the question. A scale
-- change mid-stream would poison every trend line.

CREATE TABLE IF NOT EXISTS survey_questions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT,
  entity_target TEXT NOT NULL CHECK(entity_target IN ('company', 'manager', 'bookkeeper', 'community')),
  answer_format TEXT NOT NULL CHECK(answer_format IN ('nps', 'likert5', 'multi_select', 'yes_no', 'open_text')),
  format_config JSONB,
  chat_phrasing TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Trigger library ──────────────────────────────────────────────────
-- A trigger is a plain-English description ("resident mentions gate,
-- entry system, or security problems"). A lightweight classifier —
-- same Haiku-direct pattern as the critical-alert detector — evaluates
-- resident messages against active descriptions at runtime. No keyword
-- rules to maintain.

CREATE TABLE IF NOT EXISTS survey_triggers (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Templates ────────────────────────────────────────────────────────
-- client_id NULL + is_default TRUE = the global self-signup default.
-- Concierge clients get bespoke templates (client_id set).

CREATE TABLE IF NOT EXISTS survey_templates (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_survey_templates_client ON survey_templates(client_id);

-- Draft composition — the editable working set. Publishing snapshots
-- the whole thing into survey_template_versions; the draft keeps
-- evolving toward the next version.
--
-- tier: 'required' = app guarantees delivery every session (respondent
-- may skip; skips are recorded). 'contextual' = classifier-nominated,
-- server-selected, fires at most once per session.
--
-- Retire-vs-remove: status='retired' stops asking but keeps identity —
-- re-activating resumes the trend line. Hard DELETE is reserved for
-- questions that never collected an answer.

CREATE TABLE IF NOT EXISTS survey_template_questions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'contextual' CHECK(tier IN ('required', 'contextual')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  nps_band_max INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
  retired_at TIMESTAMP,
  UNIQUE(template_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_stq_template ON survey_template_questions(template_id, status, sort_order);

CREATE TABLE IF NOT EXISTS survey_template_question_triggers (
  template_question_id INTEGER NOT NULL REFERENCES survey_template_questions(id) ON DELETE CASCADE,
  trigger_id INTEGER NOT NULL REFERENCES survey_triggers(id) ON DELETE CASCADE,
  PRIMARY KEY (template_question_id, trigger_id)
);

-- Immutable published versions — prompt_versions pattern. Rounds and
-- sessions reference a version id, never the draft, so mid-draft edits
-- can never touch a survey already in the field. (Confirmed with
-- operator: once a round starts, the survey cannot change.)
--
-- config_jsonb holds the full ordered question list with tier,
-- triggers, phrasing, and format at publish time — everything the chat
-- runtime needs without joining the (mutable) draft tables.

CREATE TABLE IF NOT EXISTS survey_template_versions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  config_jsonb JSONB NOT NULL,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT,
  UNIQUE(template_id, version_number)
);

-- ── Structured answers — the Zoho-parity data ────────────────────────
-- One row per (session, question). Absolute values, never deltas —
-- "better/worse/same" is computed at query time against the prior
-- round. status='skipped' is a real row: "12% of your board declined
-- to rate the manager" is itself signal.
--
-- entity_id points at managers/bookkeepers/communities depending on
-- entity_type (validated in app layer; polymorphic by design).
-- source='import_zoho' rows carry Zoho's delta-coded history in
-- value_json (e.g. {"zoho_delta": "somewhat_improved"}) and render in
-- delta mode on dashboards; native rounds render absolute.

CREATE TABLE IF NOT EXISTS survey_answers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  template_version_id INTEGER REFERENCES survey_template_versions(id) ON DELETE SET NULL,
  round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('company', 'manager', 'bookkeeper', 'community')),
  entity_id INTEGER,
  status TEXT NOT NULL DEFAULT 'answered' CHECK(status IN ('answered', 'skipped')),
  value_numeric NUMERIC,
  value_text TEXT,
  value_json JSONB,
  source TEXT NOT NULL DEFAULT 'widget' CHECK(source IN ('widget', 'import_zoho')),
  is_test BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_answers_question_round ON survey_answers(question_id, round_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_entity ON survey_answers(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_client ON survey_answers(client_id, is_test);
CREATE INDEX IF NOT EXISTS idx_survey_answers_session ON survey_answers(session_id);
