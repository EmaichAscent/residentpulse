import { Router } from "express";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireClientAdmin);

/**
 * Actions — what the management company is doing about org-wide patterns
 * surfaced by the AI in concluded round insights.
 *
 * Per-client; one action belongs to one theme (free-text label tying back
 * to a finding the AI surfaced). Schema is in db.js.
 */

const VALID_STATUSES = ["in_progress", "completed", "cancelled"];

/**
 * GET /api/admin/actions
 *
 * Returns this client's actions, newest first. No filtering yet — the
 * frontend filters in-memory across All / Mine / Completed.
 */
router.get("/", async (req, res) => {
  try {
    const actions = await db.all(
      `SELECT * FROM actions
       WHERE client_id = ?
       ORDER BY created_at DESC`,
      [req.clientId]
    );
    res.json(actions);
  } catch (err) {
    logger.error({ err }, "Error loading actions");
    res.status(500).json({ error: "Failed to load actions" });
  }
});

/**
 * GET /api/admin/actions/brief
 *
 * Returns the "This Quarter's Brief": top recommended actions surfaced by
 * the AI from the most recent concluded round, paired with whether an
 * action has already been logged for that theme.
 *
 * Design intent: 1–3 picks ranked by reach × sentiment impact. v0 keeps it
 * simple — just take the AI's top 3 recommended_actions verbatim and let
 * a future PR introduce a real ranking.
 */
router.get("/brief", async (req, res) => {
  try {
    const round = await db.get(
      `SELECT id, round_number, insights_json, concluded_at
       FROM survey_rounds
       WHERE client_id = ? AND status = 'concluded' AND insights_json IS NOT NULL
         AND is_test = ?
       ORDER BY round_number DESC LIMIT 1`,
      [req.clientId, req.isTestMode]
    );

    if (!round) {
      return res.json({ round: null, picks: [], total_respondents: 0 });
    }

    // Total completed sessions for the round — drives the NPS lift
    // projection on the frontend (lift = 0.5 × affected_detractors /
    // total_respondents × 100).
    const respondentRow = await db.get(
      `SELECT COUNT(*) AS count FROM sessions
       WHERE round_id = ? AND completed = TRUE AND is_mock IS NOT TRUE
         AND is_test = ?`,
      [round.id, req.isTestMode]
    );
    const totalRespondents = Number(respondentRow?.count || 0);

    let picks = [];
    try {
      const insights = round.insights_json;
      const recommended = Array.isArray(insights?.recommended_actions)
        ? insights.recommended_actions
        : [];
      picks = recommended.slice(0, 3).map((r, i) => ({
        rank: i + 1,
        // Theme is the recommendation TEXT — matching key against
        // actions.theme and recommendation_decisions.theme.
        theme: r.action || r.theme || r.title || r.headline || `Pick ${i + 1}`,
        summary: r.impact || r.summary || r.description || r.body || "",
        priority: r.priority || null,
        rationale: r.rationale || r.evidence || null,
        // Surfaces drive the NPS-lift projection. Older insights
        // generated before these prompts shipped won't carry them.
        affected_count: typeof r.affected_count === "number" ? r.affected_count : null,
        affected_detractor_count:
          typeof r.affected_detractor_count === "number" ? r.affected_detractor_count : null,
        mentions: typeof r.mentions === "number" ? r.mentions : null,
        community_count: typeof r.community_count === "number" ? r.community_count : null,
        nps_when_raised: typeof r.nps_when_raised === "number" ? r.nps_when_raised : null,
      }));
    } catch {
      picks = [];
    }

    if (picks.length > 0) {
      const themes = picks.map((p) => p.theme);

      // Match logged actions by theme.
      const logged = await db.all(
        `SELECT id, theme, status FROM actions
         WHERE client_id = ? AND theme = ANY($2::text[])`,
        [req.clientId, themes]
      );
      const loggedByTheme = new Map(logged.map((row) => [row.theme, row]));

      // Match accept/reject decisions for THIS round's picks.
      const decisions = await db.all(
        `SELECT theme, decision, decided_at FROM recommendation_decisions
         WHERE round_id = ? AND client_id = ?`,
        [round.id, req.clientId]
      );
      const decisionByTheme = new Map(decisions.map((d) => [d.theme, d]));

      picks = picks.map((p) => {
        const l = loggedByTheme.get(p.theme);
        const d = decisionByTheme.get(p.theme);
        return {
          ...p,
          has_action: !!l,
          logged_action_id: l?.id || null,
          logged_action_status: l?.status || null,
          decision: d?.decision || null,
          decided_at: d?.decided_at || null,
        };
      });
    }

    res.json({
      round: { id: round.id, round_number: round.round_number, concluded_at: round.concluded_at },
      picks,
      total_respondents: totalRespondents,
    });
  } catch (err) {
    logger.error({ err }, "Error loading actions brief");
    res.status(500).json({ error: "Failed to load brief" });
  }
});

/**
 * POST /api/admin/actions
 * Body: { theme: string, title: string, details?: string, owner_email?: string }
 */
router.post("/", async (req, res) => {
  const { theme, title, details, owner_email } = req.body || {};

  if (!theme || !theme.trim()) {
    return res.status(400).json({ error: "theme is required" });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  try {
    const result = await db.run(
      `INSERT INTO actions (client_id, theme, title, details, owner_email)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.clientId,
        theme.trim(),
        title.trim(),
        details?.trim() || null,
        owner_email?.trim() || req.userEmail || null,
      ]
    );
    const action = await db.get("SELECT * FROM actions WHERE id = ?", [result.lastInsertRowid]);
    res.json(action);
  } catch (err) {
    logger.error({ err }, "Error creating action");
    res.status(500).json({ error: "Failed to create action" });
  }
});

/**
 * PATCH /api/admin/actions/:id
 * Body: { status?: 'in_progress'|'completed'|'cancelled', title?, details? }
 *
 * Marking an action 'completed' stamps completed_at server-side.
 */
router.patch("/:id", async (req, res) => {
  const { status, title, details, owner_email } = req.body || {};
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid action id" });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const existing = await db.get("SELECT * FROM actions WHERE id = ? AND client_id = ?", [
      id,
      req.clientId,
    ]);
    if (!existing) {
      return res.status(404).json({ error: "Action not found" });
    }

    // Build an UPDATE with only the changed fields.
    const updates = [];
    const params = [];
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
      if (status === "completed") {
        updates.push("completed_at = CURRENT_TIMESTAMP");
      } else {
        updates.push("completed_at = NULL");
      }
    }
    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ error: "title cannot be empty" });
      }
      updates.push("title = ?");
      params.push(title.trim());
    }
    if (details !== undefined) {
      updates.push("details = ?");
      params.push(details?.trim() || null);
    }
    // owner_email reassignment — empty string clears the owner.
    // Source of truth for who's selectable lives on the Account page;
    // this endpoint just persists what the OwnerPicker dropdown sent.
    if (owner_email !== undefined) {
      const trimmed = typeof owner_email === "string" ? owner_email.trim() : "";
      updates.push("owner_email = ?");
      params.push(trimmed || null);
    }
    if (updates.length === 0) {
      return res.json(existing); // nothing to change
    }

    params.push(id);
    await db.run(`UPDATE actions SET ${updates.join(", ")} WHERE id = ?`, params);

    const updated = await db.get("SELECT * FROM actions WHERE id = ?", [id]);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Error updating action");
    res.status(500).json({ error: "Failed to update action" });
  }
});

/**
 * Recommendation decisions — accept/reject state per AI-generated
 * recommendation on a concluded round. The Round Results page surfaces
 * picks with these three states:
 *   • no decision yet  → Accept / Reject buttons
 *   • accepted, no logged action → "Configure & assign →" button
 *   • accepted + logged action → "View →" deep-link
 *   • rejected → muted "Rejected" pill with Undo
 */
router.post("/decisions", async (req, res) => {
  const { round_id, theme, decision } = req.body || {};

  if (!round_id || !theme || !theme.trim()) {
    return res.status(400).json({ error: "round_id and theme are required" });
  }
  if (!["accepted", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'accepted' or 'rejected'" });
  }

  try {
    // Confirm the round belongs to this client (don't let one tenant
    // record decisions on another's rounds).
    const round = await db.get("SELECT id FROM survey_rounds WHERE id = ? AND client_id = ?", [
      Number(round_id),
      req.clientId,
    ]);
    if (!round) {
      return res.status(404).json({ error: "Round not found" });
    }

    // Upsert by (round_id, theme) — flipping a previous decision
    // overwrites it.
    await db.run(
      `INSERT INTO recommendation_decisions
         (client_id, round_id, theme, decision, decided_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (round_id, theme) DO UPDATE
         SET decision = EXCLUDED.decision,
             decided_at = CURRENT_TIMESTAMP,
             decided_by = EXCLUDED.decided_by`,
      [req.clientId, Number(round_id), theme.trim(), decision, req.userEmail || null]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error recording recommendation decision");
    res.status(500).json({ error: "Failed to record decision" });
  }
});

router.delete("/decisions", async (req, res) => {
  const { round_id, theme } = req.body || {};

  if (!round_id || !theme || !theme.trim()) {
    return res.status(400).json({ error: "round_id and theme are required" });
  }

  try {
    await db.run(
      `DELETE FROM recommendation_decisions
       WHERE client_id = ? AND round_id = ? AND theme = ?`,
      [req.clientId, Number(round_id), theme.trim()]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error clearing recommendation decision");
    res.status(500).json({ error: "Failed to clear decision" });
  }
});

/**
 * DELETE /api/admin/actions/:id
 *
 * Hard delete. The journal isn't append-only — admins can prune entries
 * they logged in error.
 */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid action id" });
  }

  try {
    const existing = await db.get("SELECT id FROM actions WHERE id = ? AND client_id = ?", [
      id,
      req.clientId,
    ]);
    if (!existing) {
      return res.status(404).json({ error: "Action not found" });
    }

    await db.run("DELETE FROM actions WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting action");
    res.status(500).json({ error: "Failed to delete action" });
  }
});

export default router;
