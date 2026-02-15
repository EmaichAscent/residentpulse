import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { sendInvitation } from "../utils/emailService.js";

const router = Router();
router.use(requireClientAdmin);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get all survey rounds for this client
router.get("/", async (req, res) => {
  try {
    const rounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent') as invitations_sent
       FROM survey_rounds sr
       WHERE sr.client_id = ?
       ORDER BY sr.round_number`,
      [req.clientId]
    );
    res.json(rounds);
  } catch (err) {
    console.error("Error fetching survey rounds:", err);
    res.status(500).json({ error: err.message });
  }
});

// Schedule initial survey rounds
router.post("/schedule", async (req, res) => {
  try {
    const { first_launch_date } = req.body;

    if (!first_launch_date) {
      return res.status(400).json({ error: "first_launch_date is required" });
    }

    // Validate date format
    const parsedDate = new Date(first_launch_date + "T00:00:00Z");
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Check no rounds already exist
    const existing = await db.get(
      "SELECT id FROM survey_rounds WHERE client_id = ?",
      [req.clientId]
    );
    if (existing) {
      return res.status(400).json({ error: "Survey rounds already scheduled. Use recalculate to adjust." });
    }

    // Get cadence from subscription
    const subscription = await db.get(
      `SELECT cs.survey_cadence, sp.survey_rounds_per_year
       FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ? AND cs.status = 'active'`,
      [req.clientId]
    );

    const cadence = subscription?.survey_cadence || subscription?.survey_rounds_per_year || 2;
    const monthsBetween = cadence === 4 ? 3 : 6;

    // Generate rounds for the year
    const rounds = [];
    for (let i = 0; i < cadence; i++) {
      const roundDate = new Date(parsedDate);
      roundDate.setMonth(roundDate.getMonth() + (i * monthsBetween));

      await db.run(
        "INSERT INTO survey_rounds (client_id, round_number, scheduled_date) VALUES (?, ?, ?)",
        [req.clientId, i + 1, roundDate.toISOString().split("T")[0]]
      );
      rounds.push({ round_number: i + 1, scheduled_date: roundDate.toISOString().split("T")[0] });
    }

    // Return the created rounds
    const createdRounds = await db.all(
      "SELECT * FROM survey_rounds WHERE client_id = ? ORDER BY round_number",
      [req.clientId]
    );

    res.json(createdRounds);
  } catch (err) {
    console.error("Error scheduling rounds:", err);
    res.status(500).json({ error: err.message });
  }
});

// Launch a survey round
router.post("/:id/launch", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    // Validate round belongs to client and is planned
    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );

    if (!round) {
      return res.status(404).json({ error: "Survey round not found" });
    }

    if (round.status !== "planned") {
      return res.status(400).json({ error: `Cannot launch a round that is ${round.status}` });
    }

    // Check no other round is in progress
    const activeRound = await db.get(
      "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'in_progress'",
      [req.clientId]
    );

    if (activeRound) {
      return res.status(400).json({ error: "Another survey round is already in progress. Wait for it to conclude before launching a new one." });
    }

    // Get all board members
    const members = await db.all(
      "SELECT id, email, first_name, last_name, community_name, management_company FROM users WHERE client_id = ?",
      [req.clientId]
    );

    if (members.length === 0) {
      return res.status(400).json({ error: "No board members found. Add board members before launching a survey round." });
    }

    // Calculate close date (30 days from now)
    const now = new Date();
    const closesAt = new Date(now);
    closesAt.setDate(closesAt.getDate() + 30);

    // Update round status
    await db.run(
      "UPDATE survey_rounds SET status = 'in_progress', launched_at = CURRENT_TIMESTAMP, closes_at = ?, members_invited = ? WHERE id = ?",
      [closesAt.toISOString(), members.length, roundId]
    );

    // Send invitations to all board members
    let sentCount = 0;
    let failedCount = 0;

    for (const member of members) {
      try {
        // Generate token with expiry matching round close date
        const token = crypto.randomUUID();

        await db.run(
          "UPDATE users SET invitation_token = ?, invitation_token_expires = ?, last_invited_at = CURRENT_TIMESTAMP WHERE id = ?",
          [token, closesAt.toISOString(), member.id]
        );

        // Send email with round info
        await sendInvitation(member, token, {
          closesAt: closesAt.toISOString(),
          roundNumber: round.round_number
        });

        // Log invitation with round_id
        await db.run(
          "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, round_id) VALUES (?, ?, ?, ?, ?)",
          [member.id, req.clientId, req.userId, "sent", roundId]
        );

        sentCount++;
      } catch (err) {
        console.error(`Failed to send invitation to ${member.email}:`, err);

        try {
          await db.run(
            "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, error_message, round_id) VALUES (?, ?, ?, ?, ?, ?)",
            [member.id, req.clientId, req.userId, "failed", err.message, roundId]
          );
        } catch (logErr) {
          console.error("Failed to log invitation error:", logErr);
        }

        failedCount++;
      }

      // Rate limit: 500ms between emails
      if (member !== members[members.length - 1]) {
        await sleep(500);
      }
    }

    res.json({
      ok: true,
      sent: sentCount,
      failed: failedCount,
      closes_at: closesAt.toISOString()
    });
  } catch (err) {
    console.error("Error launching round:", err);
    res.status(500).json({ error: err.message });
  }
});

// Recalculate planned rounds after cadence change
router.post("/recalculate", async (req, res) => {
  try {
    // Delete all planned rounds
    await db.run(
      "DELETE FROM survey_rounds WHERE client_id = ? AND status = 'planned'",
      [req.clientId]
    );

    // Get the latest non-planned round as anchor
    const lastRound = await db.get(
      `SELECT * FROM survey_rounds WHERE client_id = ? AND status IN ('in_progress', 'concluded')
       ORDER BY round_number DESC LIMIT 1`,
      [req.clientId]
    );

    // Get current cadence
    const subscription = await db.get(
      `SELECT cs.survey_cadence, sp.survey_rounds_per_year
       FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ? AND cs.status = 'active'`,
      [req.clientId]
    );

    const cadence = subscription?.survey_cadence || subscription?.survey_rounds_per_year || 2;
    const monthsBetween = cadence === 4 ? 3 : 6;

    if (lastRound) {
      // Calculate remaining rounds from anchor
      const anchorDate = new Date(lastRound.closes_at || lastRound.scheduled_date);
      const nextRoundNumber = lastRound.round_number + 1;

      // Get how many total rounds already exist (concluded + in_progress)
      const existingCount = await db.get(
        "SELECT COUNT(*) as count FROM survey_rounds WHERE client_id = ?",
        [req.clientId]
      );

      const remainingSlots = cadence - (existingCount?.count || 0);

      for (let i = 0; i < remainingSlots; i++) {
        const roundDate = new Date(anchorDate);
        roundDate.setMonth(roundDate.getMonth() + ((i + 1) * monthsBetween));

        await db.run(
          "INSERT INTO survey_rounds (client_id, round_number, scheduled_date) VALUES (?, ?, ?)",
          [req.clientId, nextRoundNumber + i, roundDate.toISOString().split("T")[0]]
        );
      }
    }

    // Return updated rounds
    const rounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent') as invitations_sent
       FROM survey_rounds sr
       WHERE sr.client_id = ?
       ORDER BY sr.round_number`,
      [req.clientId]
    );

    res.json(rounds);
  } catch (err) {
    console.error("Error recalculating rounds:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
