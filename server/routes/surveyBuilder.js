import { Router } from "express";
import db from "../db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import logger from "../utils/logger.js";
import {
  ENTITY_PREFIX,
  ANSWER_FORMATS,
  nextQuestionCode,
  questionHasAnswers,
  buildTemplateConfig,
  validateConfigForPublish,
} from "../utils/surveyCatalog.js";

/**
 * Survey builder API (Zoho parity Phase C1 — docs/ZOHO_PARITY_PLAN.md).
 * SuperAdmin-only: CAM staff author the question catalog, trigger
 * library, and per-client templates here. Client admins never see it.
 *
 * Mounted at /api/superadmin/surveys.
 */

const router = Router();
router.use(requireSuperAdmin);

// ── Questions (shared library) ───────────────────────────────────────

router.get("/questions", async (_req, res) => {
  const questions = await db.all(
    `SELECT q.*,
            (SELECT COUNT(DISTINCT tq.template_id) FROM survey_template_questions tq
              WHERE tq.question_id = q.id AND tq.status = 'active') as used_in_templates,
            EXISTS(SELECT 1 FROM survey_answers a WHERE a.question_id = q.id) as has_answers
     FROM survey_questions q
     ORDER BY q.status ASC, q.code`
  );
  res.json(questions);
});

router.post("/questions", async (req, res) => {
  try {
    const { label, category, entity_target, answer_format, format_config, chat_phrasing } =
      req.body;
    if (!label?.trim()) return res.status(400).json({ error: "Label is required" });
    if (!ENTITY_PREFIX[entity_target])
      return res.status(400).json({ error: "Invalid entity_target" });
    if (!ANSWER_FORMATS.includes(answer_format))
      return res.status(400).json({ error: "Invalid answer_format" });

    const code = await nextQuestionCode(entity_target);
    const result = await db.run(
      `INSERT INTO survey_questions (code, label, category, entity_target, answer_format, format_config, chat_phrasing)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        label.trim(),
        category?.trim() || null,
        entity_target,
        answer_format,
        format_config ? JSON.stringify(format_config) : null,
        chat_phrasing?.trim() || null,
      ]
    );
    res.json({ id: result.lastInsertRowid, code });
  } catch (err) {
    logger.error({ err }, "Failed to create survey question");
    res.status(500).json({ error: "Failed to create question" });
  }
});

router.put("/questions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const question = await db.get("SELECT * FROM survey_questions WHERE id = ?", [id]);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const { label, category, chat_phrasing, status, answer_format, format_config } = req.body;

    // The format LOCKS once answers exist — a 1–5 that becomes a 0–10
    // mid-stream would poison every trend chart. Everything else stays
    // editable forever.
    if (answer_format !== undefined || format_config !== undefined) {
      const locked = await questionHasAnswers(id);
      if (locked) {
        return res.status(409).json({
          error:
            "Answer format is locked — this question has collected responses. Create a new question for a different scale.",
        });
      }
      if (answer_format !== undefined) {
        if (!ANSWER_FORMATS.includes(answer_format))
          return res.status(400).json({ error: "Invalid answer_format" });
        await db.run(
          "UPDATE survey_questions SET answer_format = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [answer_format, id]
        );
      }
      if (format_config !== undefined) {
        await db.run(
          "UPDATE survey_questions SET format_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [format_config ? JSON.stringify(format_config) : null, id]
        );
      }
    }

    if (label !== undefined && label?.trim()) {
      await db.run(
        "UPDATE survey_questions SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [label.trim(), id]
      );
    }
    if (category !== undefined) {
      await db.run(
        "UPDATE survey_questions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [category?.trim() || null, id]
      );
    }
    if (chat_phrasing !== undefined) {
      await db.run(
        "UPDATE survey_questions SET chat_phrasing = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [chat_phrasing?.trim() || null, id]
      );
    }
    if (status !== undefined && ["active", "archived"].includes(status)) {
      await db.run(
        "UPDATE survey_questions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to update survey question");
    res.status(500).json({ error: "Failed to update question" });
  }
});

// ── Triggers (shared library) ────────────────────────────────────────

router.get("/triggers", async (_req, res) => {
  const triggers = await db.all(
    `SELECT t.*,
            (SELECT COUNT(*) FROM survey_template_question_triggers tqt
              WHERE tqt.trigger_id = t.id) as used_by_count
     FROM survey_triggers t
     ORDER BY t.label`
  );
  res.json(triggers);
});

router.post("/triggers", async (req, res) => {
  try {
    const { label, description } = req.body;
    if (!label?.trim() || !description?.trim())
      return res.status(400).json({ error: "Label and description are required" });
    const result = await db.run("INSERT INTO survey_triggers (label, description) VALUES (?, ?)", [
      label.trim(),
      description.trim(),
    ]);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err }, "Failed to create trigger");
    res.status(500).json({ error: "Failed to create trigger" });
  }
});

router.put("/triggers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const trigger = await db.get("SELECT id FROM survey_triggers WHERE id = ?", [id]);
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    const { label, description } = req.body;
    if (label !== undefined && label?.trim()) {
      await db.run("UPDATE survey_triggers SET label = ? WHERE id = ?", [label.trim(), id]);
    }
    if (description !== undefined && description?.trim()) {
      await db.run("UPDATE survey_triggers SET description = ? WHERE id = ?", [
        description.trim(),
        id,
      ]);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to update trigger");
    res.status(500).json({ error: "Failed to update trigger" });
  }
});

// ── Templates ────────────────────────────────────────────────────────

router.get("/templates", async (_req, res) => {
  const templates = await db.all(
    `SELECT t.*, c.company_name as client_name,
            (SELECT COUNT(*) FROM survey_template_questions tq
              WHERE tq.template_id = t.id AND tq.status = 'active') as question_count,
            (SELECT MAX(v.version_number) FROM survey_template_versions v
              WHERE v.template_id = t.id) as latest_version
     FROM survey_templates t
     LEFT JOIN clients c ON c.id = t.client_id
     ORDER BY t.is_default DESC, c.company_name NULLS FIRST, t.name`
  );
  res.json(templates);
});

router.post("/templates", async (req, res) => {
  try {
    const { name, client_id, is_default } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    // One global default, ever. is_default with a client_id makes no
    // sense (a client-specific template can't be the signup fallback).
    if (is_default) {
      if (client_id) {
        return res.status(400).json({ error: "The default template must be global (no client)" });
      }
      const existing = await db.get(
        "SELECT id FROM survey_templates WHERE is_default = TRUE LIMIT 1"
      );
      if (existing) {
        return res
          .status(409)
          .json({ error: "A default template already exists", id: existing.id });
      }
    }

    const result = await db.run(
      "INSERT INTO survey_templates (client_id, name, is_default) VALUES (?, ?, ?)",
      [client_id || null, name.trim(), !!is_default]
    );
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err }, "Failed to create template");
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.get("/templates/:id", async (req, res) => {
  const id = Number(req.params.id);
  const template = await db.get(
    `SELECT t.*, c.company_name as client_name FROM survey_templates t
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?`,
    [id]
  );
  if (!template) return res.status(404).json({ error: "Template not found" });

  const questions = await db.all(
    `SELECT tq.id as template_question_id, tq.tier, tq.sort_order, tq.nps_band_max, tq.status,
            tq.retired_at,
            q.id as question_id, q.code, q.label, q.category, q.entity_target,
            q.answer_format, q.format_config, q.chat_phrasing,
            (SELECT COUNT(DISTINCT a.round_id) FROM survey_answers a
              WHERE a.question_id = q.id
                AND (? IS NULL OR a.client_id = ?)) as rounds_with_answers
     FROM survey_template_questions tq
     JOIN survey_questions q ON q.id = tq.question_id
     WHERE tq.template_id = ?
     ORDER BY tq.status ASC, tq.sort_order, tq.id`,
    [template.client_id, template.client_id, id]
  );

  for (const q of questions) {
    q.triggers = await db.all(
      `SELECT t.id, t.label, t.description
       FROM survey_template_question_triggers tqt
       JOIN survey_triggers t ON t.id = tqt.trigger_id
       WHERE tqt.template_question_id = ?`,
      [q.template_question_id]
    );
  }

  const versions = await db.all(
    `SELECT id, version_number, published_at, published_by
     FROM survey_template_versions WHERE template_id = ? ORDER BY version_number DESC`,
    [id]
  );

  res.json({ ...template, questions, versions });
});

router.put("/templates/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const template = await db.get("SELECT id FROM survey_templates WHERE id = ?", [id]);
    if (!template) return res.status(404).json({ error: "Template not found" });
    const { name } = req.body;
    if (name !== undefined && name?.trim()) {
      await db.run(
        "UPDATE survey_templates SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [name.trim(), id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to update template");
    res.status(500).json({ error: "Failed to update template" });
  }
});

// ── Template composition ─────────────────────────────────────────────

router.post("/templates/:id/questions", async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const template = await db.get("SELECT id FROM survey_templates WHERE id = ?", [templateId]);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const { question_id, tier, sort_order, nps_band_max, trigger_ids } = req.body;
    const question = await db.get("SELECT id FROM survey_questions WHERE id = ?", [question_id]);
    if (!question) return res.status(400).json({ error: "Question not found" });
    if (tier && !["required", "contextual"].includes(tier))
      return res.status(400).json({ error: "Invalid tier" });

    // Re-adding a previously retired question re-activates it (the
    // trend line resumes) instead of violating the unique constraint.
    const existing = await db.get(
      "SELECT id, status FROM survey_template_questions WHERE template_id = ? AND question_id = ?",
      [templateId, question_id]
    );
    let tqId;
    if (existing) {
      if (existing.status === "active") {
        return res.status(409).json({ error: "Question is already in this template" });
      }
      await db.run(
        `UPDATE survey_template_questions
         SET status = 'active', retired_at = NULL, tier = ?, sort_order = ?, nps_band_max = ?
         WHERE id = ?`,
        [tier || "contextual", sort_order ?? 0, nps_band_max ?? null, existing.id]
      );
      tqId = existing.id;
    } else {
      const result = await db.run(
        `INSERT INTO survey_template_questions (template_id, question_id, tier, sort_order, nps_band_max)
         VALUES (?, ?, ?, ?, ?)`,
        [templateId, question_id, tier || "contextual", sort_order ?? 0, nps_band_max ?? null]
      );
      tqId = result.lastInsertRowid;
    }

    if (Array.isArray(trigger_ids)) {
      await db.run("DELETE FROM survey_template_question_triggers WHERE template_question_id = ?", [
        tqId,
      ]);
      for (const triggerId of trigger_ids) {
        await db.run(
          "INSERT INTO survey_template_question_triggers (template_question_id, trigger_id) VALUES (?, ?)",
          [tqId, triggerId]
        );
      }
    }

    res.json({ id: tqId });
  } catch (err) {
    logger.error({ err }, "Failed to add question to template");
    res.status(500).json({ error: "Failed to add question" });
  }
});

router.put("/templates/:id/questions/:tqId", async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const tqId = Number(req.params.tqId);
    const tq = await db.get(
      "SELECT * FROM survey_template_questions WHERE id = ? AND template_id = ?",
      [tqId, templateId]
    );
    if (!tq) return res.status(404).json({ error: "Template question not found" });

    const { tier, sort_order, nps_band_max, status, trigger_ids } = req.body;

    if (tier !== undefined && ["required", "contextual"].includes(tier)) {
      await db.run("UPDATE survey_template_questions SET tier = ? WHERE id = ?", [tier, tqId]);
    }
    if (sort_order !== undefined) {
      await db.run("UPDATE survey_template_questions SET sort_order = ? WHERE id = ?", [
        Number(sort_order) || 0,
        tqId,
      ]);
    }
    if (nps_band_max !== undefined) {
      await db.run("UPDATE survey_template_questions SET nps_band_max = ? WHERE id = ?", [
        nps_band_max ?? null,
        tqId,
      ]);
    }
    if (status !== undefined && ["active", "retired"].includes(status)) {
      await db.run(
        `UPDATE survey_template_questions
         SET status = ?, retired_at = ${status === "retired" ? "CURRENT_TIMESTAMP" : "NULL"}
         WHERE id = ?`,
        [status, tqId]
      );
    }
    if (Array.isArray(trigger_ids)) {
      await db.run("DELETE FROM survey_template_question_triggers WHERE template_question_id = ?", [
        tqId,
      ]);
      for (const triggerId of trigger_ids) {
        await db.run(
          "INSERT INTO survey_template_question_triggers (template_question_id, trigger_id) VALUES (?, ?)",
          [tqId, triggerId]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to update template question");
    res.status(500).json({ error: "Failed to update template question" });
  }
});

router.delete("/templates/:id/questions/:tqId", async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const tqId = Number(req.params.tqId);
    const tq = await db.get(
      "SELECT tq.*, t.client_id FROM survey_template_questions tq JOIN survey_templates t ON t.id = tq.template_id WHERE tq.id = ? AND tq.template_id = ?",
      [tqId, templateId]
    );
    if (!tq) return res.status(404).json({ error: "Template question not found" });

    // Continuity guard: a question with collected answers must be
    // RETIRED (history preserved), never hard-removed. The builder UI
    // intercepts this before it happens; the API enforces it.
    const hasAnswers = await db.get(
      `SELECT 1 FROM survey_answers WHERE question_id = ?
         AND (? IS NULL OR client_id = ?) LIMIT 1`,
      [tq.question_id, tq.client_id, tq.client_id]
    );
    if (hasAnswers) {
      return res.status(409).json({
        error:
          "This question has collected answers — retire it instead (keeps history; re-add later resumes the trend).",
        suggestion: "retire",
      });
    }

    await db.run("DELETE FROM survey_template_question_triggers WHERE template_question_id = ?", [
      tqId,
    ]);
    await db.run("DELETE FROM survey_template_questions WHERE id = ?", [tqId]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to remove template question");
    res.status(500).json({ error: "Failed to remove question" });
  }
});

// ── Publish ──────────────────────────────────────────────────────────

router.post("/templates/:id/publish", async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    const template = await db.get("SELECT id FROM survey_templates WHERE id = ?", [templateId]);
    if (!template) return res.status(404).json({ error: "Template not found" });

    const config = await buildTemplateConfig(templateId);
    const problems = validateConfigForPublish(config);
    if (problems.length) {
      return res.status(400).json({ error: "Template is not publishable", problems });
    }

    const maxRow = await db.get(
      "SELECT MAX(version_number) as max_v FROM survey_template_versions WHERE template_id = ?",
      [templateId]
    );
    const versionNumber = (maxRow?.max_v ?? 0) + 1;

    const result = await db.run(
      `INSERT INTO survey_template_versions (template_id, version_number, config_jsonb, published_by)
       VALUES (?, ?, ?, ?)`,
      [templateId, versionNumber, JSON.stringify(config), req.adminEmail || "superadmin"]
    );

    res.json({
      id: result.lastInsertRowid,
      version_number: versionNumber,
      question_count: config.questions.length,
    });
  } catch (err) {
    logger.error({ err }, "Failed to publish template");
    res.status(500).json({ error: "Failed to publish template" });
  }
});

export default router;
