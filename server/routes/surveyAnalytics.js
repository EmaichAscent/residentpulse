import { Router } from "express";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";

/**
 * Structured-answer analytics (Zoho parity Phase E1 —
 * docs/ZOHO_PARITY_PLAN.md).
 *
 * Read-only aggregates over survey_answers, client-scoped:
 *
 *   GET /questions  — per-question, per-round: average (absolute
 *     answers), answered/skipped counts, and Zoho delta-label counts
 *     for imported delta-vocabulary rounds. "Better/worse/same" for
 *     native data is computed BY THE READER from consecutive round
 *     averages — we never store deltas (the Zoho lesson).
 *
 *   GET /people?type=managers|bookkeepers — per-person rollups:
 *     "Debbie's book averages 4.2" — the stat Zoho could never
 *     produce because people were just strings.
 *
 * GET-only by design: works for full admins AND viewer-tier logins
 * (Phase G) without touching the write guard.
 */

const router = Router();
router.use(requireClientAdmin);

/**
 * Compose the per-question response from the three aggregate row sets.
 * Pure — exported for tests.
 */
export function composeQuestionTrends(questions, numericRows, statusRows, deltaRows) {
  const byQuestion = new Map();
  for (const q of questions) {
    byQuestion.set(q.id, {
      question_id: q.id,
      code: q.code,
      label: q.label,
      category: q.category,
      entity_target: q.entity_target,
      answer_format: q.answer_format,
      rounds: new Map(),
    });
  }

  const roundFor = (entry, row) => {
    const key = row.round_id ?? 0;
    if (!entry.rounds.has(key)) {
      entry.rounds.set(key, {
        round_id: row.round_id,
        round_number: row.round_number,
        avg: null,
        answered: 0,
        skipped: 0,
        delta_counts: {},
      });
    }
    return entry.rounds.get(key);
  };

  for (const row of numericRows) {
    const entry = byQuestion.get(row.question_id);
    if (!entry) continue;
    const r = roundFor(entry, row);
    r.avg = row.avg == null ? null : Math.round(Number(row.avg) * 100) / 100;
  }
  for (const row of statusRows) {
    const entry = byQuestion.get(row.question_id);
    if (!entry) continue;
    const r = roundFor(entry, row);
    if (row.status === "answered") r.answered = Number(row.count);
    if (row.status === "skipped") r.skipped = Number(row.count);
  }
  for (const row of deltaRows) {
    const entry = byQuestion.get(row.question_id);
    if (!entry) continue;
    const r = roundFor(entry, row);
    r.delta_counts[row.zoho_label] = Number(row.count);
  }

  return [...byQuestion.values()]
    .map((entry) => ({
      ...entry,
      rounds: [...entry.rounds.values()].sort(
        (a, b) => (a.round_number ?? 0) - (b.round_number ?? 0)
      ),
    }))
    .filter((entry) => entry.rounds.length > 0);
}

router.get("/questions", async (req, res) => {
  const questions = await db.all(
    `SELECT DISTINCT q.id, q.code, q.label, q.category, q.entity_target, q.answer_format
     FROM survey_questions q
     JOIN survey_answers a ON a.question_id = q.id
     WHERE a.client_id = ? AND a.is_test = ?
     ORDER BY q.code`,
    [req.clientId, req.isTestMode]
  );

  const numericRows = await db.all(
    `SELECT a.question_id, a.round_id, r.round_number, AVG(a.value_numeric) as avg
     FROM survey_answers a
     LEFT JOIN survey_rounds r ON r.id = a.round_id
     WHERE a.client_id = ? AND a.is_test = ? AND a.status = 'answered' AND a.value_numeric IS NOT NULL
     GROUP BY a.question_id, a.round_id, r.round_number`,
    [req.clientId, req.isTestMode]
  );

  const statusRows = await db.all(
    `SELECT a.question_id, a.round_id, r.round_number, a.status, COUNT(*) as count
     FROM survey_answers a
     LEFT JOIN survey_rounds r ON r.id = a.round_id
     WHERE a.client_id = ? AND a.is_test = ?
     GROUP BY a.question_id, a.round_id, r.round_number, a.status`,
    [req.clientId, req.isTestMode]
  );

  const deltaRows = await db.all(
    `SELECT a.question_id, a.round_id, r.round_number,
            a.value_json->>'zoho_label' as zoho_label, COUNT(*) as count
     FROM survey_answers a
     LEFT JOIN survey_rounds r ON r.id = a.round_id
     WHERE a.client_id = ? AND a.is_test = ?
       AND a.value_json->>'zoho_kind' = 'delta'
     GROUP BY a.question_id, a.round_id, r.round_number, a.value_json->>'zoho_label'`,
    [req.clientId, req.isTestMode]
  );

  res.json(composeQuestionTrends(questions, numericRows, statusRows, deltaRows));
});

router.get("/people", async (req, res) => {
  const type = req.query.type === "bookkeepers" ? "bookkeepers" : "managers";
  const entityType = type === "bookkeepers" ? "bookkeeper" : "manager";
  const fkColumn = type === "bookkeepers" ? "bookkeeper_id" : "manager_id";

  const people = await db.all(
    `SELECT p.id, p.name, p.status,
            (SELECT COUNT(*) FROM communities c
              WHERE c.${fkColumn} = p.id AND c.status = 'active') as community_count,
            COUNT(a.id) FILTER (WHERE a.status = 'answered' AND a.value_numeric IS NOT NULL) as rated_answers,
            AVG(a.value_numeric) FILTER (WHERE a.status = 'answered') as overall_avg
     FROM ${type} p
     LEFT JOIN survey_answers a
       ON a.entity_type = ? AND a.entity_id = p.id
      AND a.client_id = p.client_id AND a.is_test = ?
     WHERE p.client_id = ? AND p.is_test = ?
     GROUP BY p.id
     ORDER BY p.status ASC, p.name`,
    [entityType, req.isTestMode, req.clientId, req.isTestMode]
  );

  const perRound = await db.all(
    `SELECT a.entity_id, a.round_id, r.round_number, AVG(a.value_numeric) as avg,
            COUNT(*) FILTER (WHERE a.value_numeric IS NOT NULL) as rated
     FROM survey_answers a
     LEFT JOIN survey_rounds r ON r.id = a.round_id
     WHERE a.client_id = ? AND a.is_test = ? AND a.entity_type = ? AND a.status = 'answered'
     GROUP BY a.entity_id, a.round_id, r.round_number`,
    [req.clientId, req.isTestMode, entityType]
  );

  const roundsByPerson = new Map();
  for (const row of perRound) {
    if (!roundsByPerson.has(row.entity_id)) roundsByPerson.set(row.entity_id, []);
    roundsByPerson.get(row.entity_id).push({
      round_id: row.round_id,
      round_number: row.round_number,
      avg: row.avg == null ? null : Math.round(Number(row.avg) * 100) / 100,
      rated: Number(row.rated),
    });
  }

  res.json(
    people.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      community_count: Number(p.community_count),
      rated_answers: Number(p.rated_answers),
      overall_avg: p.overall_avg == null ? null : Math.round(Number(p.overall_avg) * 100) / 100,
      rounds: (roundsByPerson.get(p.id) || []).sort(
        (a, b) => (a.round_number ?? 0) - (b.round_number ?? 0)
      ),
    }))
  );
});

export default router;
