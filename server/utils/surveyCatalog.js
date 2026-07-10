import db from "../db.js";

/**
 * Survey catalog helpers (Zoho parity Phase C1 — docs/ZOHO_PARITY_PLAN.md).
 *
 * Pure-logic pieces of the survey builder API live here so they can be
 * unit-tested with a mocked db, keeping routes/surveyBuilder.js thin.
 */

// Question codes are permanent, entity-prefixed identities. The prefix
// encodes what the score attaches to; the number is a monotonically
// increasing series per prefix. Codes never get reused or reassigned —
// they are how answers stay comparable across template versions.
export const ENTITY_PREFIX = Object.freeze({
  company: "C",
  manager: "M",
  bookkeeper: "F",
  community: "Y",
});

export const ANSWER_FORMATS = Object.freeze([
  "nps",
  "likert5",
  "multi_select",
  "yes_no",
  "open_text",
]);

/**
 * Next free code in the entity's series, e.g. "M15". Scans existing
 * codes with the prefix and takes max+1 — codes of retired/archived
 * questions still count, so a code is never reissued.
 */
export async function nextQuestionCode(entityTarget) {
  const prefix = ENTITY_PREFIX[entityTarget];
  if (!prefix) throw new Error(`Unknown entity_target "${entityTarget}"`);
  const rows = await db.all(`SELECT code FROM survey_questions WHERE code LIKE ?`, [`${prefix}%`]);
  let max = 0;
  for (const r of rows) {
    const m = r.code.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/** True when the question has collected at least one answer (any client). */
export async function questionHasAnswers(questionId) {
  const row = await db.get(`SELECT 1 FROM survey_answers WHERE question_id = ? LIMIT 1`, [
    questionId,
  ]);
  return !!row;
}

/**
 * Build the immutable config snapshot for publishing a template.
 * Everything the chat runtime needs is denormalized in — question
 * format, phrasing, tier, triggers — so a session never has to join
 * the (mutable) draft tables.
 *
 * Only ACTIVE draft rows are published; retired questions keep their
 * history but stop shipping.
 */
export async function buildTemplateConfig(templateId) {
  const rows = await db.all(
    `SELECT tq.id as template_question_id, tq.tier, tq.sort_order, tq.nps_band_max,
            q.id as question_id, q.code, q.label, q.category, q.entity_target,
            q.answer_format, q.format_config, q.chat_phrasing
     FROM survey_template_questions tq
     JOIN survey_questions q ON q.id = tq.question_id
     WHERE tq.template_id = ? AND tq.status = 'active' AND q.status = 'active'
     ORDER BY tq.sort_order, tq.id`,
    [templateId]
  );

  const questions = [];
  for (const row of rows) {
    const triggers = await db.all(
      `SELECT t.id, t.label, t.description
       FROM survey_template_question_triggers tqt
       JOIN survey_triggers t ON t.id = tqt.trigger_id
       WHERE tqt.template_question_id = ?
       ORDER BY t.id`,
      [row.template_question_id]
    );
    questions.push({
      question_id: row.question_id,
      code: row.code,
      label: row.label,
      category: row.category,
      entity_target: row.entity_target,
      answer_format: row.answer_format,
      format_config: parseMaybeJson(row.format_config),
      chat_phrasing: row.chat_phrasing,
      tier: row.tier,
      sort_order: row.sort_order,
      nps_band_max: row.nps_band_max,
      triggers,
    });
  }

  return { questions };
}

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value; // pg returns JSONB as object
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Validate a template config is publishable: at least one question,
 * every contextual question armed with at least one trigger (an
 * untriggered contextual question can never fire — the design-time
 * conflict the question editor warns about).
 * Returns a list of problems; empty = publishable.
 */
export function validateConfigForPublish(config) {
  const problems = [];
  if (!config.questions?.length) {
    problems.push("Template has no active questions.");
    return problems;
  }
  for (const q of config.questions) {
    if (q.tier === "contextual" && (!q.triggers || q.triggers.length === 0)) {
      problems.push(
        `"${q.label}" (${q.code}) is contextual but has no triggers — it would never fire.`
      );
    }
  }
  return problems;
}
