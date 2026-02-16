import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { sendInvitation } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { generateRoundInsights, computeLiveWordFrequencies } from "../utils/insightGenerator.js";

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

// Cross-round trends data (must be before /:id routes)
router.get("/trends", async (req, res) => {
  try {
    const rounds = await db.all(
      `SELECT sr.id, sr.round_number, sr.status, sr.launched_at, sr.concluded_at,
              sr.members_invited, sr.insights_json, sr.word_frequencies
       FROM survey_rounds sr
       WHERE sr.client_id = ? AND sr.status IN ('in_progress', 'concluded')
       ORDER BY sr.round_number`,
      [req.clientId]
    );

    const trendsData = [];
    for (const round of rounds) {
      // Get session stats for this round
      const sessions = await db.all(
        `SELECT s.nps_score, s.community_name, s.completed
         FROM sessions s
         WHERE s.round_id = ? AND s.client_id = ?`,
        [round.id, req.clientId]
      );

      const completed = sessions.filter((s) => s.completed);
      const npsScores = completed.filter((s) => s.nps_score != null).map((s) => s.nps_score);
      const promoters = npsScores.filter((n) => n >= 9).length;
      const detractors = npsScores.filter((n) => n <= 6).length;
      const npsScore = npsScores.length > 0
        ? Math.round(((promoters - detractors) / npsScores.length) * 100)
        : null;

      // Community cohort: group by community, take median NPS, classify
      const communities = {};
      for (const s of completed) {
        if (s.community_name && s.nps_score != null) {
          if (!communities[s.community_name]) communities[s.community_name] = [];
          communities[s.community_name].push(s.nps_score);
        }
      }

      const cohorts = { promoter: 0, passive: 0, detractor: 0 };
      const communityDetails = [];
      for (const [name, scores] of Object.entries(communities)) {
        scores.sort((a, b) => a - b);
        const median = scores[Math.floor(scores.length / 2)];
        const cohort = median >= 9 ? "promoter" : median >= 7 ? "passive" : "detractor";
        cohorts[cohort]++;
        communityDetails.push({ name, median, cohort, respondents: scores.length });
      }

      trendsData.push({
        id: round.id,
        round_number: round.round_number,
        status: round.status,
        launched_at: round.launched_at,
        concluded_at: round.concluded_at,
        nps_score: npsScore,
        response_count: completed.length,
        invited_count: round.members_invited || 0,
        response_rate: round.members_invited > 0
          ? Math.round((completed.length / round.members_invited) * 100)
          : 0,
        community_cohorts: cohorts,
        community_details: communityDetails,
        word_frequencies: round.word_frequencies || null,
      });
    }

    res.json(trendsData);
  } catch (err) {
    console.error("Error fetching trends:", err);
    res.status(500).json({ error: err.message });
  }
});

// Round dashboard — single endpoint for all round data
router.get("/:id/dashboard", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    // All sessions for this round
    const sessions = await db.all(
      `SELECT s.id, s.email, s.nps_score, s.completed, s.summary, s.community_name,
              s.created_at, u.first_name, u.last_name
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.round_id = ? AND s.client_id = ?
       ORDER BY s.created_at DESC`,
      [roundId, req.clientId]
    );

    // Invited users (from invitation_logs)
    const invitedUsers = await db.all(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.community_name
       FROM invitation_logs il
       JOIN users u ON u.id = il.user_id
       WHERE il.round_id = ? AND il.email_status = 'sent'`,
      [roundId]
    );

    // Non-responders: invited but no completed session
    const completedUserIds = new Set(
      sessions.filter((s) => s.completed).map((s) => s.email)
    );
    const nonResponders = invitedUsers.filter((u) => !completedUserIds.has(u.email));

    // NPS calculations
    const completedSessions = sessions.filter((s) => s.completed && s.nps_score != null);
    const npsScores = completedSessions.map((s) => s.nps_score);
    const promoters = npsScores.filter((n) => n >= 9).length;
    const passives = npsScores.filter((n) => n >= 7 && n <= 8).length;
    const detractors = npsScores.filter((n) => n <= 6).length;
    const npsScore = npsScores.length > 0
      ? Math.round(((promoters - detractors) / npsScores.length) * 100)
      : null;

    // Community cohorts
    const communities = {};
    for (const s of completedSessions) {
      if (s.community_name) {
        if (!communities[s.community_name]) communities[s.community_name] = [];
        communities[s.community_name].push(s.nps_score);
      }
    }

    const communityCohorts = [];
    for (const [name, scores] of Object.entries(communities)) {
      scores.sort((a, b) => a - b);
      const median = scores[Math.floor(scores.length / 2)];
      const cohort = median >= 9 ? "promoter" : median >= 7 ? "passive" : "detractor";
      communityCohorts.push({ name, median, cohort, respondents: scores.length });
    }

    // Critical alerts for this round
    const alerts = await db.all(
      `SELECT ca.*, u.first_name, u.last_name, u.email as user_email, u.community_name as alert_community
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       WHERE ca.round_id = ? AND ca.client_id = ?
       ORDER BY ca.created_at DESC`,
      [roundId, req.clientId]
    );

    // Word frequencies (stored for concluded, computed live for active)
    let wordFrequencies = null;
    if (round.word_frequencies) {
      wordFrequencies = round.word_frequencies;
    } else if (round.status === "in_progress") {
      // Compute live from user messages
      const userMessages = await db.all(
        `SELECT m.content
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.round_id = ? AND s.client_id = ? AND m.role = 'user'`,
        [roundId, req.clientId]
      );
      wordFrequencies = computeLiveWordFrequencies(userMessages);
    }

    // Insights (concluded rounds only)
    const insights = round.insights_json || null;

    res.json({
      round: {
        id: round.id,
        round_number: round.round_number,
        status: round.status,
        scheduled_date: round.scheduled_date,
        launched_at: round.launched_at,
        closes_at: round.closes_at,
        concluded_at: round.concluded_at,
        members_invited: round.members_invited,
        insights_generated_at: round.insights_generated_at,
      },
      nps: {
        score: npsScore,
        promoters,
        passives,
        detractors,
        total: npsScores.length,
      },
      response_rate: {
        completed: completedSessions.length,
        invited: invitedUsers.length,
        percentage: invitedUsers.length > 0
          ? Math.round((completedSessions.length / invitedUsers.length) * 100)
          : 0,
      },
      sessions,
      non_responders: nonResponders,
      community_cohorts: communityCohorts,
      alerts,
      word_frequencies: wordFrequencies,
      insights,
    });
  } catch (err) {
    console.error("Error fetching round dashboard:", err);
    res.status(500).json({ error: err.message });
  }
});

// Close a round early
router.post("/:id/close", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });
    if (round.status !== "in_progress") {
      return res.status(400).json({ error: "Only in-progress rounds can be closed" });
    }

    await db.run(
      "UPDATE survey_rounds SET status = 'concluded', concluded_at = CURRENT_TIMESTAMP WHERE id = ?",
      [roundId]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "close_round_early",
      entityType: "survey_round",
      entityId: roundId,
      clientId: req.clientId,
      metadata: { round_number: round.round_number }
    });

    // Generate insights asynchronously
    generateRoundInsights(roundId, req.clientId).catch((err) =>
      console.error(`Failed to generate insights for round ${roundId}:`, err.message)
    );

    res.json({ ok: true, message: "Round closed. AI insights are being generated." });
  } catch (err) {
    console.error("Error closing round:", err);
    res.status(500).json({ error: err.message });
  }
});

// Regenerate insights for a concluded round
router.post("/:id/regenerate-insights", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });
    if (round.status !== "concluded") {
      return res.status(400).json({ error: "Insights can only be generated for concluded rounds" });
    }

    // Run synchronously so the admin gets the result
    const insights = await generateRoundInsights(roundId, req.clientId);

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "regenerate_insights",
      entityType: "survey_round",
      entityId: roundId,
      clientId: req.clientId,
    });

    res.json({ ok: true, insights });
  } catch (err) {
    console.error("Error regenerating insights:", err);
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

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "launch_round",
      entityType: "survey_round",
      entityId: roundId,
      clientId: req.clientId,
      metadata: { sent: sentCount, failed: failedCount, round_number: round.round_number }
    });

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
