-- ══════════════════════════════════════════════════════════════════════
-- Zoho Parity — Phase D1: hybrid chat runtime columns
-- ══════════════════════════════════════════════════════════════════════
-- All-additive. Sessions gain a template binding + a widget gate;
-- messages gain a type so structured widgets can live in the
-- transcript alongside text.
--
--   sessions.template_version_id — which published survey version this
--     session runs. NULL = legacy pure-chat flow (today's behavior,
--     unchanged). Stamped at session creation from the client's
--     template, falling back to the global default.
--
--   sessions.pending_question_id — the widget currently gating the
--     chat. While set, POST /api/chat rejects normal text (the
--     composer is locked client-side too); POST /api/chat/answer for
--     this question (answer or skip) clears it. Server-enforced, same
--     philosophy as close_phase.
--
--   messages.message_type — 'text' (default, all existing rows),
--     'widget' (assistant turn carrying a structured question), or
--     'widget_answer' (the respondent's structured reply, rendered
--     compactly and visible to the AI as conversational context).
--
--   messages.widget_payload — for 'widget': {question_id, code, label,
--     entity_target, answer_format, format_config, phrasing, gate}.
--     For 'widget_answer': {question_id, status, value}.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS template_version_id INTEGER REFERENCES survey_template_versions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_question_id INTEGER REFERENCES survey_questions(id) ON DELETE SET NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS widget_payload JSONB;
