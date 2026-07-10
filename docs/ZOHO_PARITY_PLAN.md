# Zoho Parity — Design & Build Plan

**Branch:** `zoho-parity` (off `staging`)
**Goal:** Retire Zoho CRM + Zoho Survey. ResidentPulse becomes the only tool
CAM Ascent uses to run board surveys for concierge clients, while remaining
self-serve for signup clients.
**Approved direction (mockups, July 2026):**

1. Hybrid survey — AI chat remains the envelope; structured widgets
   (NPS grid, 1–5 Likert, multi-select, yes/no, open text) drop into the
   conversation. Two tiers: **required** (app guarantees delivery every
   session, respondent may skip — skips are recorded) and **contextual**
   (AI-nominated via plain-English triggers, server decides).
2. SuperAdmin **survey builder** — shared question library, per-client
   templates, one global default for self-signup. Continuity guardrails
   (trend badges, retire-vs-remove interception).
3. **Question editor** with live respondent preview, plain-English
   triggers evaluated by a classifier, design-time conflict callouts.

Mockups (Claude artifacts, private):
- Respondent hybrid chat: 679acf27-fb9f-495a-91cd-b111e94dbaf1
- Survey builder: 1e4df97b-8c60-43ef-82e1-076664982e7b
- Question editor: 5c8c711e-236c-4104-bc27-7fdcdb4e412b

---

## Core design decisions (settled)

| Decision | Choice | Why |
|---|---|---|
| Delta vs absolute storage | Store **absolute** ratings; compute deltas at query time | Any question gets trend charts for free; no Zoho-style delta columns |
| Question identity | **Shared library** across all templates | Same question = comparable data across clients → portfolio benchmarking |
| Tier (required/contextual) | **Per-template**, not per-question | Cadden can require what another client leaves contextual |
| Triggers | **Plain-English descriptions**, classifier-evaluated | No keyword rules to maintain; same Haiku-classifier pattern as critical alerts |
| Who decides a widget fires | **The server.** Classifier nominates, server picks (max 1/message) | Hard-won close-flow lesson: reliability lives in code, not prompts |
| Required delivery | Weave-in first, **baseline batch** before wrap-up for leftovers | Every session ends with core columns answered or explicitly skipped |
| Gate | Required widget **locks the composer**; skip always available | Comparability without abandonment; a skip is a recorded data point |
| Template immutability | Publish = frozen version; **rounds snapshot template at launch** | Same pattern as `round_community_snapshots`; mid-round edits never touch live surveys |
| Scale lock | Answer format **locks after first response** | A 1–5 → 0–10 change would poison trends. Everything else stays editable |
| Removal guard | **Retire** (keep history, stop asking) over delete | Re-adding resumes the trend line |
| Trigger conflicts | Never block, always inform (test box + save-time check) | Overlap is sometimes intentional; starved questions must be visible |
| Conflict tiebreak | Template order (top wins), max 1 contextual fire per message | Simple + visible. Revisit if a real case needs explicit priority |

---

## Schema (all additive, idempotent, `IF NOT EXISTS`)

New migration file per phase, auto-loaded from `db.js` startup like all
existing migrations. **Nothing existing is renamed, dropped, or altered
in place.** Existing chat flow is untouched until Phase D flips it per
template.

### Phase A tables

```sql
-- People being rated (promoted from communities.community_manager_name string)
CREATE TABLE IF NOT EXISTS managers (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, name, is_test)
);

CREATE TABLE IF NOT EXISTS bookkeepers (
  -- same shape as managers
);

ALTER TABLE communities ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES managers(id) ON DELETE SET NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS bookkeeper_id INTEGER REFERENCES bookkeepers(id) ON DELETE SET NULL;
-- community_manager_name stays for back-compat; backfill creates managers
-- from distinct names and links manager_id.

-- Question catalog (shared library)
CREATE TABLE IF NOT EXISTS survey_questions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- C03, M07, F02, Y01 — permanent
  label TEXT NOT NULL,
  category TEXT,
  entity_target TEXT NOT NULL CHECK(entity_target IN ('company','manager','bookkeeper','community')),
  answer_format TEXT NOT NULL CHECK(answer_format IN ('nps','likert5','multi_select','yes_no','open_text')),
  format_config JSONB,                  -- endpoint labels / options list
  chat_phrasing TEXT,                   -- NULL = AI phrases naturally
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Format lock is enforced in the app layer: reject format changes when
-- survey_answers rows exist for the question.

-- Trigger library (plain-English classifier conditions)
CREATE TABLE IF NOT EXISTS survey_triggers (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,                  -- short chip label
  description TEXT NOT NULL,            -- what the classifier evaluates
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Templates. client_id NULL = the global self-signup default.
CREATE TABLE IF NOT EXISTS survey_templates (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Draft composition (editable). Publishing snapshots to a version row.
CREATE TABLE IF NOT EXISTS survey_template_questions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'contextual' CHECK(tier IN ('required','contextual')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  nps_band_max INTEGER,                 -- contextual: only fire when NPS <= this (NULL = any)
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  retired_at TIMESTAMP,
  UNIQUE(template_id, question_id)
);

CREATE TABLE IF NOT EXISTS survey_template_question_triggers (
  template_question_id INTEGER NOT NULL REFERENCES survey_template_questions(id) ON DELETE CASCADE,
  trigger_id INTEGER NOT NULL REFERENCES survey_triggers(id) ON DELETE CASCADE,
  PRIMARY KEY (template_question_id, trigger_id)
);

-- Immutable published versions (prompt_versions pattern)
CREATE TABLE IF NOT EXISTS survey_template_versions (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  config_jsonb JSONB NOT NULL,          -- full ordered question list w/ tier, triggers, phrasing at publish time
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT,
  UNIQUE(template_id, version_number)
);

-- Structured answers — the Zoho-parity data
CREATE TABLE IF NOT EXISTS survey_answers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  template_version_id INTEGER REFERENCES survey_template_versions(id) ON DELETE SET NULL,
  round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL,   -- denormalized
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,         -- denormalized
  entity_type TEXT NOT NULL,
  entity_id INTEGER,                    -- managers.id / bookkeepers.id / communities.id when applicable
  status TEXT NOT NULL DEFAULT 'answered' CHECK(status IN ('answered','skipped')),
  value_numeric NUMERIC,                -- nps, likert, yes/no (1/0)
  value_text TEXT,                      -- open text
  value_json JSONB,                     -- multi-select selections; zoho delta payloads
  source TEXT NOT NULL DEFAULT 'widget' CHECK(source IN ('widget','import_zoho')),
  is_test BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question_round ON survey_answers(question_id, round_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_entity ON survey_answers(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_client ON survey_answers(client_id, is_test);
```

### Phase D columns (chat runtime)

```sql
-- Which template version a session runs (NULL = legacy pure-chat flow)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS template_version_id INTEGER REFERENCES survey_template_versions(id) ON DELETE SET NULL;
-- Server-enforced gate: when set, chat only accepts an answer/skip for this question
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_question_id INTEGER REFERENCES survey_questions(id) ON DELETE SET NULL;

-- Widget messages in the transcript
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
  -- 'text' | 'widget' (AI turn carrying a question) | 'widget_answer' (user's structured reply)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS widget_payload JSONB;
  -- widget: {question_id, code, format, config, phrasing}
  -- widget_answer: {question_id, status, value}
```

### Phase G column (roles)

```sql
ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','viewer'));
```

---

## Runtime architecture (Phase D)

**Session start.** Resolve the client's template: latest published version
of their assigned template, else the global default's latest version.
Stamp `sessions.template_version_id`. Sessions with NULL keep today's
pure-chat behavior — the rollout is per-template opt-in, zero risk to
existing clients.

**Widget delivery.** A widget is an assistant `messages` row with
`message_type='widget'` and a `widget_payload`. The client (ChatPage)
renders the matching component (NPS grid / Likert / chips / yes-no /
textarea) inside the assistant bubble, with "Prefer not to answer"
underneath.

**Answer flow.** `POST /api/chat/answer {session_id, question_id, value | skip}`:
1. Validate against `sessions.pending_question_id` (or an open non-gating widget).
2. Write `survey_answers` (status answered/skipped).
3. Append a `messages` row `role='user', message_type='widget_answer'`
   with a compact rendering (e.g. `[Manager responsiveness: 2/5 — Poor]`)
   so the AI has the answer in conversational context.
4. Clear `pending_question_id`.

**Contextual nomination.** After each substantive user message, a
classifier call (Haiku direct, same bypass pattern as the critical-alert
detector — NOT through the provider router) receives the active
contextual triggers for this session's template plus the message, and
returns matching question codes. The **server** picks at most one
(template order wins), checks it hasn't fired already this session,
checks the per-session contextual cap (4), and injects the widget with
the next AI turn.

**Required delivery.** The close-flow state machine
(`server/utils/closeFlow.js`) gains one phase:

```
interview → baseline_batch → awaiting_playback_response → done
```

When `shouldFirePlayback()` returns true, the server first checks for
unanswered required questions. If any remain, it emits them as gating
widgets (the baseline batch: "Before we wrap, N quick baseline rates…"),
one gate at a time. When the required set is exhausted (answered or
skipped), the playback fires, then the templated final close — both
already server-driven and shipped.

**Weave-in (best-effort).** The interview system prompt gets a short
addendum listing the required questions not yet asked, instructing the
model that when the conversation naturally touches one, it should signal
`[ASK:code]` — the server intercepts the tag (stripped from display,
close-flow tag pattern) and swaps in the real widget. Anything not woven
lands in the baseline batch. Reliability comes from the batch; the
weave-in is UX polish.

**Conflict check (design time).** Two endpoints backing the editor:
`POST /api/superadmin/triggers/test {description, sample}` runs the real
classifier and returns which triggers (including existing ones) the
sample matches. `POST /api/superadmin/triggers/overlap {description}`
compares the new description pairwise against the template's existing
triggers. Both are one Haiku call each.

---

## Phased build (PR-sized, each independently shippable)

**Phase A — Schema foundation.** One PR. All Phase A tables + indexes +
migration wiring in db.js + idempotency tests. No behavior change, no UI.
Merge → staging → verify migrations apply cleanly → main. Establishes
the beachhead everything else builds on.

**Phase B — Entity promotion.** One PR. Backfill script (distinct
`community_manager_name` → `managers` rows, link `manager_id`),
SuperAdmin CRUD (minimal list + add/edit/deactivate for managers and
bookkeepers, attach to communities). Community edit form gains manager
and bookkeeper dropdowns.

**Phase C — Catalog + builder (3 PRs).**
- **C1:** REST API — CRUD for questions, triggers, templates,
  template-questions; publish flow (draft → immutable version); format
  lock; retire/re-add. Seed the question catalog from Cadden's 42 Zoho
  dimensions + the Default template (trimmed baseline set).
- **C2:** Builder UI (SuperAdmin → Surveys): template cards, template
  editor with required/contextual sections, trend badges, retire-vs-
  remove interception. Per builder mockup.
- **C3:** Question editor with live preview, trigger creation/testing,
  conflict callouts. Per editor mockup.

**Phase D — Hybrid chat runtime (3 PRs).**
- **D1:** Message types + widget rendering in ChatPage + answer endpoint
  + gate. Behind template opt-in (sessions with NULL template keep
  today's flow).
- **D2:** Required delivery — closeFlow gains `baseline_batch` phase;
  weave-in prompt addendum + `[ASK:code]` interception.
- **D3:** Contextual nomination classifier + server-side selection +
  per-session cap.

**Phase E — Dashboards (2+ PRs, scoped with Delilah).**
- **E1:** Question-level: per-question trend lines (absolute + computed
  delta), skip rates, answer distributions; per-manager and per-
  bookkeeper rollups ("Debbie's book averages 4.2").
- **E2:** Parity pass against her actual Zoho dashboards — walk through
  every report she uses, mirror or consciously improve. **Requires a
  working session with her; do not guess.**

**Phase F — Zoho historical import.** One PR. Script: Cadden xlsx →
sessions (`completed=true`, import-flagged) + `survey_answers`
(`source='import_zoho'`, delta labels preserved in `value_json`, e.g.
`{"zoho_delta": "somewhat_improved"}`). Zoho history renders in delta
mode on dashboards; native rounds render absolute. Import is idempotent
(keyed on email + submission date) and dry-run first, same discipline as
the push-prompt scripts.

**Phase G — Viewer role.** One PR. `client_admins.role`, API gating
(viewer = GET-only on dashboard endpoints), UI hides all mutation
affordances. Fleshed out with Delilah before build.

**Phase H — Parallel run + cutover.** Operational, no code. One full
round on both systems for Cadden; wife verifies parity; Zoho off.

Order: A → B → C1 → C2 → C3 → D1 → D2 → D3 → E1 → F → E2 → G → H.
A through D3 are sequential dependencies. E/F/G can interleave after D1.

---

## Guardrails (hold for every PR)

1. Additive-only migrations. Never rename/drop. `IF NOT EXISTS` everywhere.
2. Every new table carries `is_test` where user-facing data flows through it.
3. Existing pure-chat flow untouched until a client's template opts in
   (`sessions.template_version_id IS NULL` = legacy path).
4. Classifier calls bypass the AI provider router (Haiku direct) — they
   are infrastructure, not part of the Anthropic-vs-xAI comparison.
5. Anything that must happen reliably is decided in server code; the AI
   nominates, phrases, and summarizes, but never controls delivery.
6. Each phase merges zoho-parity → staging, verified on the staging
   deploy, before staging → main.

## Pre-flight checks (before Phase A merges)

- [ ] Confirm the Railway **staging environment has its own Postgres**
      (not shared with production). Additive migrations are safe either
      way, but Phase F import testing needs an isolated DB.
- [ ] Rotate the production Postgres password (exposed in a July chat
      session; still pending).
- [ ] Confirm with Delilah: does she ever need to change a survey
      mid-round? (Plan assumes no; rounds freeze their template.)

## Open questions (answer during build, none block Phase A)

- Trigger tiebreak: template order (planned) vs explicit priority number.
- Skipped-required questions on dashboards: own category (planned) vs
  folded into "no response."
- Multi-select option lock: can add options, can't remove ones with
  answers (planned).
- Baseline batch size: max 3 gates in a row before it feels like a form?
  Instrument abandonment per gate and tune.
- Employee survey (the OTHER Zoho survey, aimed at management-company
  staff): out of scope for this plan; revisit after Phase H.
