import db from "../db.js";
import logger from "./logger.js";
import { classifyMessage } from "./triggerClassifier.js";

/**
 * Hybrid chat runtime helpers (Zoho parity Phase D —
 * docs/ZOHO_PARITY_PLAN.md).
 *
 * Everything the chat needs to run a survey template inside the
 * conversation: template resolution at session start, widget message
 * emission, structured-answer recording, and the entity resolution
 * that attaches manager/bookkeeper/community answers to the right
 * roster row.
 */

/**
 * Which published template version should a new session run?
 * The client's own template wins; the global default is the fallback;
 * NULL (legacy pure-chat flow) when neither has a published version.
 */
export async function resolveTemplateVersionId(clientId) {
  const clientVersion = await db.get(
    `SELECT v.id FROM survey_template_versions v
     JOIN survey_templates t ON t.id = v.template_id
     WHERE t.client_id = ?
     ORDER BY v.version_number DESC LIMIT 1`,
    [clientId]
  );
  if (clientVersion) return clientVersion.id;

  const defaultVersion = await db.get(
    `SELECT v.id FROM survey_template_versions v
     JOIN survey_templates t ON t.id = v.template_id
     WHERE t.is_default = TRUE
     ORDER BY v.version_number DESC LIMIT 1`
  );
  return defaultVersion?.id ?? null;
}

/** Parsed config for a session's template version (or null). */
export async function getTemplateConfig(templateVersionId) {
  if (!templateVersionId) return null;
  const row = await db.get("SELECT config_jsonb FROM survey_template_versions WHERE id = ?", [
    templateVersionId,
  ]);
  if (!row) return null;
  const config =
    typeof row.config_jsonb === "string" ? JSON.parse(row.config_jsonb) : row.config_jsonb;
  return config || null;
}

/**
 * What roster row does an answer attach to?
 *   company    → NULL (the client itself, already on the answer row)
 *   community  → the session's community
 *   manager    → the community's assigned manager
 *   bookkeeper → the community's assigned bookkeeper
 */
export async function resolveEntityId(entityTarget, session) {
  if (entityTarget === "company") return null;
  if (!session.community_id) return null;
  if (entityTarget === "community") return session.community_id;

  const community = await db.get("SELECT manager_id, bookkeeper_id FROM communities WHERE id = ?", [
    session.community_id,
  ]);
  if (!community) return null;
  if (entityTarget === "manager") return community.manager_id ?? null;
  if (entityTarget === "bookkeeper") return community.bookkeeper_id ?? null;
  return null;
}

/**
 * Compact transcript rendering of a structured answer. This is what
 * the respondent sees as their "message" and what the AI reads as
 * conversational context for its next turn.
 */
export function formatAnswerLine(question, value, skipped) {
  if (skipped) return `[${question.label}: skipped]`;
  switch (question.answer_format) {
    case "nps":
      return `[${question.label}: ${value}/10]`;
    case "likert5": {
      const cfg = question.format_config || {};
      const endpoint = value === 1 ? cfg.low : value === 5 ? cfg.high : null;
      return `[${question.label}: ${value}/5${endpoint ? ` — ${endpoint}` : ""}]`;
    }
    case "yes_no":
      return `[${question.label}: ${value ? "Yes" : "No"}]`;
    case "multi_select": {
      const selections = Array.isArray(value) ? value : [];
      return `[${question.label}: ${selections.length ? selections.join(", ") : "none of the options"}]`;
    }
    case "open_text":
      return `[${question.label}: ${value}]`;
    default:
      return `[${question.label}: ${String(value)}]`;
  }
}

/**
 * Record a structured answer (or skip): one survey_answers row + one
 * widget_answer message in the transcript + clear the gate if this
 * question was gating. Idempotent per (session, question) via the
 * unique constraint — a double-tap updates nothing and reports the
 * conflict.
 *
 * Returns { display } — the transcript line.
 */
export async function recordAnswer({ session, question, value, skipped, transcript = true }) {
  const entityId = await resolveEntityId(question.entity_target, session);

  let valueNumeric = null;
  let valueText = null;
  let valueJson = null;
  if (!skipped) {
    switch (question.answer_format) {
      case "nps":
      case "likert5":
        valueNumeric = Number(value);
        break;
      case "yes_no":
        valueNumeric = value ? 1 : 0;
        break;
      case "multi_select":
        valueJson = JSON.stringify({ selections: Array.isArray(value) ? value : [] });
        break;
      case "open_text":
        valueText = String(value ?? "");
        break;
      default:
        valueText = String(value ?? "");
    }
  }

  await db.run(
    `INSERT INTO survey_answers
       (session_id, question_id, template_version_id, round_id, client_id,
        entity_type, entity_id, status, value_numeric, value_text, value_json, source, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'widget', ?)`,
    [
      session.id,
      question.question_id,
      session.template_version_id ?? null,
      session.round_id ?? null,
      session.client_id ?? null,
      question.entity_target,
      entityId,
      skipped ? "skipped" : "answered",
      valueNumeric,
      valueText,
      valueJson,
      !!session.is_test,
    ]
  );

  // NPS answers also feed the session's own score so the rest of the
  // product (dashboards, detractor alerts, review fast-path) keeps
  // working identically whether NPS arrived via widget or legacy flow.
  if (!skipped && question.answer_format === "nps") {
    await db.run("UPDATE sessions SET nps_score = ? WHERE id = ?", [valueNumeric, session.id]);
  }

  const display = formatAnswerLine(
    question,
    skipped ? null : normalizeForDisplay(question, value),
    skipped
  );

  // transcript:false is for answers that arrived OUTSIDE a widget tap
  // (e.g. the legacy NPS scale bridging to Q001) — the conversation
  // already documents them, so a bracketed line would duplicate.
  if (transcript) {
    await db.run(
      "INSERT INTO messages (session_id, role, content, message_type, widget_payload) VALUES (?, 'user', ?, 'widget_answer', ?)",
      [
        session.id,
        display,
        JSON.stringify({
          question_id: question.question_id,
          status: skipped ? "skipped" : "answered",
          value: skipped ? null : value,
        }),
      ]
    );
  }

  if (session.pending_question_id === question.question_id) {
    await db.run("UPDATE sessions SET pending_question_id = NULL WHERE id = ?", [session.id]);
  }

  logger.info(
    {
      session_id: session.id,
      question: question.code,
      status: skipped ? "skipped" : "answered",
    },
    "survey answer recorded"
  );

  return { display };
}

function normalizeForDisplay(question, value) {
  if (question.answer_format === "multi_select") {
    return Array.isArray(value) ? value : [];
  }
  if (question.answer_format === "nps" || question.answer_format === "likert5") {
    return Number(value);
  }
  return value;
}

/**
 * Emit a widget into the transcript: an assistant message carrying the
 * structured question. `gate` locks the chat until answered/skipped
 * (required-tier delivery); contextual widgets don't gate.
 *
 * `phrasingOverride` lets the caller (D2 weave-in / baseline batch)
 * supply lead-in text; otherwise the question's chat_phrasing or the
 * plain label is used.
 */
export async function emitWidgetMessage(
  session,
  question,
  { gate = false, phrasingOverride } = {}
) {
  const content = phrasingOverride?.trim() || question.chat_phrasing?.trim() || question.label;

  const payload = {
    question_id: question.question_id,
    code: question.code,
    label: question.label,
    entity_target: question.entity_target,
    answer_format: question.answer_format,
    format_config: question.format_config ?? null,
    gate: !!gate,
  };

  await db.run(
    "INSERT INTO messages (session_id, role, content, message_type, widget_payload) VALUES (?, 'assistant', ?, 'widget', ?)",
    [session.id, content, JSON.stringify(payload)]
  );

  if (gate) {
    await db.run("UPDATE sessions SET pending_question_id = ? WHERE id = ?", [
      question.question_id,
      session.id,
    ]);
  }

  return { content, payload };
}

/**
 * Which template questions has this session already answered/skipped?
 * Returns a Set of question_ids.
 */
export async function answeredQuestionIds(sessionId) {
  const rows = await db.all("SELECT question_id FROM survey_answers WHERE session_id = ?", [
    sessionId,
  ]);
  return new Set(rows.map((r) => r.question_id));
}

// ── Required delivery (Phase D2) ─────────────────────────────────────

/**
 * Required questions this session hasn't answered yet, in template
 * order. Pure — callers supply the config and the answered set.
 */
export function getUnansweredRequired(config, answeredSet) {
  if (!config?.questions) return [];
  return config.questions.filter((q) => q.tier === "required" && !answeredSet.has(q.question_id));
}

/**
 * Lead-in for the FIRST baseline-batch widget — tells the resident
 * why structured questions are arriving before the wrap-up.
 */
export function baselineIntro(count, question) {
  const phrasing = question.chat_phrasing?.trim() || question.label;
  if (count === 1) {
    return `Before we wrap, one quick baseline rate every board member answers. ${phrasing}`;
  }
  return `Before we wrap, ${count} quick baseline rates every board member answers — they keep your response comparable with the rest of your board. First: ${phrasing}`;
}

/**
 * System-prompt addendum for weave-in (Phase D2). Lists the required
 * questions still unanswered and teaches the model the [ASK:code]
 * signal. The model only NOMINATES the moment — the server intercepts
 * the tag, strips it, and emits the real widget. Anything never woven
 * in lands in the baseline batch, so delivery is guaranteed by the
 * server either way; this is UX polish, not a reliability mechanism.
 */
export function buildWeaveInAddendum(unansweredRequired) {
  if (!unansweredRequired?.length) return "";
  const list = unansweredRequired.map((q) => `  • [ASK:${q.code}] — ${q.label}`).join("\n");
  return `\n\nSTRUCTURED RATING QUESTIONS — the survey requires these rated on a fixed scale before the chat ends:\n${list}\n\nWhen the conversation NATURALLY arrives at one of these topics, end your reply with the matching tag (e.g. [ASK:C03]) and the system will present the rating scale for you — do not describe the scale or ask for a number yourself. At most ONE tag per reply, only when the topic genuinely came up. Never mention the tags or the scales to the resident.`;
}

// ── Contextual nomination (Phase D3) ─────────────────────────────────

// Hard cap on AI-discretion widgets per session. Contextual depth is
// the hybrid's value-add, but past a handful of scales the chat starts
// feeling like a form — the exact failure the hybrid design avoids.
export const MAX_CONTEXTUAL_PER_SESSION = 4;

/**
 * Pure selection: which contextual question (if any) should fire for
 * this turn, given the classifier's matched trigger ids.
 *
 * Rules (in order):
 *   • never re-fire a question already emitted this session
 *   • respect the per-session contextual cap
 *   • respect the question's NPS band (only fire when the session's
 *     score is at or below nps_band_max; unset band = any score, and
 *     a band can't pass while the score is still unknown)
 *   • template order (sort_order) is the tiebreak — max ONE per turn
 */
export function pickContextualQuestion({
  config,
  matchedTriggerIds,
  emittedQuestionIds,
  contextualFiredCount,
  npsScore,
}) {
  if (!config?.questions || !matchedTriggerIds?.length) return null;
  if (contextualFiredCount >= MAX_CONTEXTUAL_PER_SESSION) return null;

  const matched = new Set(matchedTriggerIds);
  const eligible = config.questions
    .filter((q) => q.tier === "contextual")
    .filter((q) => !emittedQuestionIds.has(q.question_id))
    .filter((q) => (q.triggers || []).some((t) => matched.has(t.id)))
    .filter((q) => {
      if (q.nps_band_max == null) return true;
      if (npsScore == null) return false;
      return npsScore <= q.nps_band_max;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  return eligible[0] ?? null;
}

/**
 * Full contextual-nomination pass for one resident message. Collects
 * the DISTINCT triggers armed on this template's contextual questions,
 * runs the classifier once, and applies the selection rules above.
 * Designed to run CONCURRENTLY with the interview model call — Haiku
 * classification finishes well inside the reply's latency envelope.
 *
 * The classifier only nominates; everything that decides whether a
 * widget actually ships is in code.
 */
export async function selectContextualForSession(session, config, message) {
  if (!config?.questions) return null;

  const contextual = config.questions.filter((q) => q.tier === "contextual");
  if (!contextual.length) return null;

  // What has this session already seen? Answered questions AND widgets
  // already emitted (even if unanswered) both count as "fired".
  const widgetRows = await db.all(
    "SELECT widget_payload FROM messages WHERE session_id = ? AND message_type = 'widget'",
    [session.id]
  );
  const emittedQuestionIds = new Set();
  let contextualFiredCount = 0;
  const contextualIds = new Set(contextual.map((q) => q.question_id));
  for (const row of widgetRows) {
    const payload =
      typeof row.widget_payload === "string" ? JSON.parse(row.widget_payload) : row.widget_payload;
    if (!payload?.question_id) continue;
    emittedQuestionIds.add(payload.question_id);
    if (contextualIds.has(payload.question_id)) contextualFiredCount++;
  }
  for (const qid of await answeredQuestionIds(session.id)) emittedQuestionIds.add(qid);

  if (contextualFiredCount >= MAX_CONTEXTUAL_PER_SESSION) return null;

  // Distinct triggers across the not-yet-fired contextual questions —
  // no point classifying against triggers that can't select anything.
  const triggerById = new Map();
  for (const q of contextual) {
    if (emittedQuestionIds.has(q.question_id)) continue;
    for (const t of q.triggers || []) triggerById.set(t.id, t);
  }
  if (!triggerById.size) return null;

  const matchedTriggerIds = await classifyMessage(message, [...triggerById.values()]);

  return pickContextualQuestion({
    config,
    matchedTriggerIds,
    emittedQuestionIds,
    contextualFiredCount,
    npsScore: session.nps_score,
  });
}
