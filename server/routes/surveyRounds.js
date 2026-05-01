import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import {
  sendInvitation,
  notifyRoundLaunched,
  notifyRoundConcluded,
} from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { generateRoundInsights, computeLiveWordFrequencies } from "../utils/insightGenerator.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireClientAdmin);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Get all survey rounds for this client
router.get("/", async (req, res) => {
  try {
    // Auto-fill: ensure `cadence` planned rounds exist — but ONLY if user has already
    // scheduled or launched at least one round. New accounts should see the date picker first.
    const anyRound = await db.get(
      "SELECT id FROM survey_rounds WHERE client_id = ? AND is_test = ?",
      [req.clientId, req.isTestMode]
    );

    if (anyRound) {
      const subscription = await db.get(
        `SELECT cs.survey_cadence FROM client_subscriptions cs WHERE cs.client_id = ? AND cs.status = 'active'`,
        [req.clientId]
      );
      const cadence = subscription?.survey_cadence || 2;
      const intervalMonths = cadence === 4 ? 3 : 6;

      const plannedCount = await db.get(
        "SELECT COUNT(*) as count FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ?",
        [req.clientId, req.isTestMode]
      );

      if ((plannedCount?.count || 0) < cadence) {
        const lastRound = await db.get(
          `SELECT round_number, launched_at, closes_at FROM survey_rounds
           WHERE client_id = ? AND status IN ('in_progress', 'concluded') AND is_test = ?
           ORDER BY round_number DESC LIMIT 1`,
          [req.clientId, req.isTestMode]
        );
        const lastPlanned = await db.get(
          `SELECT round_number, scheduled_date FROM survey_rounds
           WHERE client_id = ? AND status = 'planned' AND is_test = ?
           ORDER BY round_number DESC LIMIT 1`,
          [req.clientId, req.isTestMode]
        );

        // Anchor: last planned round date, or last launched/closed round
        const anchorDate = lastPlanned
          ? new Date(lastPlanned.scheduled_date)
          : lastRound
            ? new Date(lastRound.closes_at || lastRound.launched_at)
            : null;

        if (anchorDate) {
          const maxRoundNum = Math.max(
            lastRound?.round_number || 0,
            lastPlanned?.round_number || 0
          );
          const currentPlanned = plannedCount?.count || 0;
          const now = new Date();

          for (let i = 0; i < cadence - currentPlanned; i++) {
            const nextDate = new Date(anchorDate);
            nextDate.setMonth(nextDate.getMonth() + intervalMonths * (i + 1));
            const finalDate =
              nextDate <= now
                ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 * (i + 1))
                : nextDate;

            await db.run(
              "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status, is_test) VALUES (?, ?, ?, 'planned', ?)",
              [req.clientId, maxRoundNum + i + 1, finalDate.toISOString(), req.isTestMode]
            );
          }
        }
      }
    }

    const rounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true AND s.is_mock IS NOT TRUE AND s.is_test = ?) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent' AND il.is_test = ?) as invitations_sent,
              (SELECT COUNT(*) FROM critical_alerts ca WHERE ca.round_id = sr.id AND ca.dismissed = FALSE AND COALESCE(ca.solved, FALSE) = FALSE AND ca.is_test = ?) as active_alert_count,
              (SELECT COUNT(DISTINCT COALESCE(cm.community_name, u.community_name))
               FROM critical_alerts ca
               LEFT JOIN users u ON u.id = ca.user_id
               LEFT JOIN communities cm ON cm.id = u.community_id
               WHERE ca.round_id = sr.id AND ca.dismissed = FALSE AND COALESCE(ca.solved, FALSE) = FALSE AND ca.is_test = ?) as alert_community_count
       FROM survey_rounds sr
       WHERE sr.client_id = ? AND sr.is_test = ?
       ORDER BY sr.round_number`,
      [req.isTestMode, req.isTestMode, req.isTestMode, req.isTestMode, req.clientId, req.isTestMode]
    );
    res.json(rounds);
  } catch (err) {
    logger.error({ err, clientId: req.clientId }, "Error fetching survey rounds");
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
      "SELECT id FROM survey_rounds WHERE client_id = ? AND is_test = ?",
      [req.clientId, req.isTestMode]
    );
    if (existing) {
      return res
        .status(400)
        .json({ error: "Survey rounds already scheduled. Use recalculate to adjust." });
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
      roundDate.setMonth(roundDate.getMonth() + i * monthsBetween);

      await db.run(
        "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, is_test) VALUES (?, ?, ?, ?)",
        [req.clientId, i + 1, roundDate.toISOString().split("T")[0], req.isTestMode]
      );
      rounds.push({ round_number: i + 1, scheduled_date: roundDate.toISOString().split("T")[0] });
    }

    // Return the created rounds
    const createdRounds = await db.all(
      "SELECT * FROM survey_rounds WHERE client_id = ? AND is_test = ? ORDER BY round_number",
      [req.clientId, req.isTestMode]
    );

    res.json(createdRounds);
  } catch (err) {
    logger.error({ err }, "Error scheduling rounds");
    if (err.message?.includes("unique constraint")) {
      return res.status(400).json({
        error:
          "Survey rounds already exist for this account. Please contact support if you need to reschedule.",
      });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * Recent activity feed for the Home page. Returns the most recent
 * completed survey responses across all rounds, with sentiment
 * (good/mid/bad based on NPS bucket) and a flagged boolean if there's
 * an active critical alert tied to the session.
 */
router.get("/recent-activity", async (req, res) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 8);
    const sessions = await db.all(
      `SELECT s.id, s.nps_score, s.created_at,
              COALESCE(u.first_name, '') AS first_name,
              COALESCE(u.last_name, '') AS last_name,
              COALESCE(c.community_name, s.community_name) AS community_name,
              EXISTS(
                SELECT 1 FROM critical_alerts ca
                WHERE ca.session_id = s.id
                  AND ca.dismissed = FALSE
                  AND COALESCE(ca.solved, FALSE) = FALSE
              ) AS flagged
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN communities c ON c.id = s.community_id
       WHERE s.client_id = ? AND s.is_test = ?
         AND s.completed = TRUE
         AND s.is_mock IS NOT TRUE
         AND s.nps_score IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [req.clientId, req.isTestMode, limit]
    );

    const enriched = sessions.map((s) => {
      const score = Number(s.nps_score);
      const tone = score >= 9 ? "good" : score <= 6 ? "bad" : "mid";
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        community_name: s.community_name,
        nps_score: score,
        flagged: !!s.flagged,
        tone,
        created_at: s.created_at,
      };
    });

    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "Error loading recent activity");
    res.status(500).json({ error: err.message });
  }
});

/**
 * Schedule a single off-cycle round at a custom date.
 *
 * Distinct from POST /schedule (which is the very first round + auto-fills
 * planned rounds per cadence). This endpoint just inserts ONE planned
 * round at the requested date with the next available round_number.
 *
 * Body: { scheduled_date: ISO, label?: string }
 * Returns: the new planned round.
 */
router.post("/custom", async (req, res) => {
  try {
    const { scheduled_date } = req.body || {};
    if (!scheduled_date) {
      return res.status(400).json({ error: "scheduled_date is required" });
    }
    const parsed = new Date(scheduled_date);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: "Invalid scheduled_date" });
    }

    const last = await db.get(
      `SELECT round_number FROM survey_rounds
       WHERE client_id = ? AND is_test = ?
       ORDER BY round_number DESC LIMIT 1`,
      [req.clientId, req.isTestMode]
    );
    const nextNumber = (last?.round_number || 0) + 1;

    const result = await db.run(
      `INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status, is_test)
       VALUES (?, ?, ?, 'planned', ?)`,
      [req.clientId, nextNumber, parsed.toISOString(), req.isTestMode]
    );
    const round = await db.get("SELECT * FROM survey_rounds WHERE id = ?", [
      result.lastInsertRowid,
    ]);
    res.json(round);
  } catch (err) {
    logger.error({ err, clientId: req.clientId }, "Error scheduling custom round");
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pre-flight checklist data for a planned round. Powers the
 * "Next round" hero on the Rounds page — four checks:
 *
 *   roster_synced_at        — most recent users.created_at|updated_at
 *   prompt_version          — latest prompt_versions row label
 *   prompt_approved         — whether a prompt version exists at all
 *                             (no per-version approval flag yet — defaults
 *                             true when there's any version on file)
 *   reminders_set           — true once a round is in 'planned' status
 *                             (admin_reminders are auto-scheduled on insert)
 *   communities_missing_contacts — communities that don't have a manager
 *                             name or any active users assigned
 */
router.get("/:id/preflight", async (req, res) => {
  try {
    const roundId = Number(req.params.id);
    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    const rosterRow = await db.get(
      `SELECT MAX(updated_at) AS latest
       FROM users WHERE client_id = ? AND is_test = ?`,
      [req.clientId, req.isTestMode]
    );

    // prompt_versions has columns (id, prompt_text, label, created_by,
    // created_at) and a prompt_key TEXT added in Phase 2. Earlier rows
    // may not have client_id either — the per-client copies are
    // distinguishable by created_by but the table is global. We pick
    // the most recent system_prompt version regardless of client and
    // count "any version on file" as approved.
    const promptRow = await db.get(
      `SELECT label, created_at FROM prompt_versions
       WHERE prompt_key = 'system_prompt'
       ORDER BY created_at DESC LIMIT 1`
    );

    const memberCounts = await db.get(
      `SELECT COUNT(*) AS invitees,
              COUNT(DISTINCT community_id) AS communities
       FROM users
       WHERE client_id = ? AND is_test = ? AND active = TRUE`,
      [req.clientId, req.isTestMode]
    );

    const missingContacts = await db.get(
      `SELECT COUNT(*) AS count FROM communities c
       WHERE c.client_id = ?
         AND (c.community_manager_name IS NULL OR c.community_manager_name = '')`,
      [req.clientId]
    );

    res.json({
      roster_synced_at: rosterRow?.latest || null,
      prompt_version: promptRow?.label || "default",
      prompt_approved: !!promptRow,
      reminders_set: round.status === "planned",
      communities_missing_contacts: Number(missingContacts?.count || 0),
      audience: {
        invitees: Number(memberCounts?.invitees || 0),
        communities: Number(memberCounts?.communities || 0),
        window_days: 30,
        reminder_days: [14, 7, 1],
      },
    });
  } catch (err) {
    logger.error({ err, clientId: req.clientId }, "Error loading preflight");
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
       WHERE sr.client_id = ? AND sr.status IN ('in_progress', 'concluded') AND sr.is_test = ?
       ORDER BY sr.round_number`,
      [req.clientId, req.isTestMode]
    );

    // Check paid tier for revenue/manager analytics
    const planResult = await db.get(
      `SELECT sp.name as plan_name FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ?`,
      [req.clientId]
    );
    const isPaidTier = planResult && planResult.plan_name !== "free";

    // Batch-load ALL sessions for all rounds in one query
    const roundIds = rounds.map((r) => r.id);
    const allSessions =
      roundIds.length > 0
        ? await db.all(
            `SELECT s.round_id, s.nps_score, s.community_id, COALESCE(sc.community_name, s.community_name) as community_name,
              COALESCE(loc.name, s.management_company) as location_name, s.completed
       FROM sessions s
       LEFT JOIN communities sc ON sc.id = s.community_id
       LEFT JOIN locations loc ON loc.id = sc.location_id
       WHERE s.round_id = ANY($1) AND s.client_id = $2 AND s.is_mock IS NOT TRUE AND s.is_test = $3`,
            [roundIds, req.clientId, req.isTestMode]
          )
        : [];

    // Group sessions by round_id for efficient lookup
    const sessionsByRound = {};
    for (const s of allSessions) {
      if (!sessionsByRound[s.round_id]) sessionsByRound[s.round_id] = [];
      sessionsByRound[s.round_id].push(s);
    }

    // Batch-load community snapshots/data for concluded rounds
    let communityDataByRound = {};
    {
      const concludedIds = rounds.filter((r) => r.status === "concluded").map((r) => r.id);
      if (concludedIds.length > 0) {
        const snapshots = await db.all(
          `SELECT round_id, community_id as id, community_name, contract_value, community_manager_name, number_of_units
           FROM round_community_snapshots WHERE round_id = ANY($1) AND status = 'active'`,
          [concludedIds]
        );
        for (const s of snapshots) {
          if (!communityDataByRound[s.round_id]) communityDataByRound[s.round_id] = [];
          communityDataByRound[s.round_id].push(s);
        }
        // For rounds without snapshots, fall back to live data
        const liveCommunities = await db.all(
          `SELECT id, community_name, contract_value, community_manager_name, number_of_units
           FROM communities WHERE client_id = $1 AND status = 'active'`,
          [req.clientId]
        );
        for (const rId of concludedIds) {
          if (!communityDataByRound[rId] || communityDataByRound[rId].length === 0) {
            communityDataByRound[rId] = liveCommunities;
          }
        }
      }
    }

    const trendsData = [];
    for (const round of rounds) {
      const sessions = sessionsByRound[round.id] || [];

      const completed = sessions.filter((s) => s.completed);
      const npsScores = completed.filter((s) => s.nps_score != null).map((s) => s.nps_score);
      const promoters = npsScores.filter((n) => n >= 9).length;
      const detractors = npsScores.filter((n) => n <= 6).length;
      const npsScore =
        npsScores.length > 0
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

      // Paid tier: Revenue at Risk + Manager Performance
      let revenueAtRisk = null;
      let managerPerformance = null;
      let locationPerformance = null;
      let sizePerformance = null;

      // Location Performance (available to all tiers — uses session data directly)
      const locationScores = {};
      for (const s of completed) {
        const loc = s.location_name;
        if (!loc || s.nps_score == null) continue;
        if (!locationScores[loc]) locationScores[loc] = [];
        locationScores[loc].push(s.nps_score);
      }
      if (Object.keys(locationScores).length > 0) {
        locationPerformance = Object.entries(locationScores)
          .filter(([_, scores]) => scores.length > 0)
          .map(([location, scores]) => {
            const p = scores.filter((n) => n >= 9).length;
            const d = scores.filter((n) => n <= 6).length;
            const nps = Math.round(((p - d) / scores.length) * 100);
            return { location, nps, respondents: scores.length };
          })
          .sort((a, b) => b.nps - a.nps);
      }

      if (round.status === "concluded") {
        const communityData = communityDataByRound[round.id] || [];

        // Build community name lookup for matching with session data
        const communityLookup = {};
        for (const c of communityData) {
          communityLookup[c.community_name.trim().toLowerCase()] = c;
        }

        // Revenue at Risk: sum contract_value for detractor communities
        const totalPortfolioValue = communityData.reduce(
          (sum, c) => sum + (Number(c.contract_value) || 0),
          0
        );
        const atRiskCommunities = communityDetails.filter((c) => c.cohort === "detractor");
        const atRiskValue = atRiskCommunities.reduce((sum, c) => {
          const meta = communityLookup[c.name.trim().toLowerCase()];
          return sum + (meta ? Number(meta.contract_value) || 0 : 0);
        }, 0);

        revenueAtRisk = {
          total_portfolio_value: totalPortfolioValue,
          at_risk_value: atRiskValue,
          percent_at_risk:
            totalPortfolioValue > 0 ? Math.round((atRiskValue / totalPortfolioValue) * 100) : 0,
        };

        // Manager Performance: group session NPS by manager
        const communityScores = {};
        for (const s of completed) {
          if (s.community_name && s.nps_score != null) {
            const key = s.community_name.trim().toLowerCase();
            if (!communityScores[key]) communityScores[key] = [];
            communityScores[key].push(s.nps_score);
          }
        }

        const managerScores = {};
        for (const c of communityData) {
          const mgr = c.community_manager_name;
          if (!mgr) continue;
          const key = c.community_name.trim().toLowerCase();
          const scores = communityScores[key] || [];
          if (!managerScores[mgr]) managerScores[mgr] = { communities: [], scores: [] };
          managerScores[mgr].communities.push(c.community_name);
          managerScores[mgr].scores.push(...scores);
        }

        managerPerformance = Object.entries(managerScores)
          .filter(([_, data]) => data.scores.length > 0)
          .map(([manager, data]) => {
            const p = data.scores.filter((n) => n >= 9).length;
            const d = data.scores.filter((n) => n <= 6).length;
            const nps = Math.round(((p - d) / data.scores.length) * 100);
            return {
              manager,
              communities: data.communities.length,
              nps,
              respondents: data.scores.length,
            };
          })
          .sort((a, b) => b.nps - a.nps);

        // Size cohorts for trends
        const withUnits = communityData
          .filter((c) => c.number_of_units)
          .sort((a, b) => a.number_of_units - b.number_of_units);
        if (withUnits.length >= 4) {
          const cohortCount = withUnits.length >= 10 ? 5 : 4;
          const perCohort = Math.ceil(withUnits.length / cohortCount);
          const labels = ["Small", "Medium", "Large", "Very Large", "Extra Large"];
          sizePerformance = [];
          for (let si = 0; si < cohortCount; si++) {
            const slice = withUnits.slice(si * perCohort, (si + 1) * perCohort);
            if (slice.length === 0) continue;
            const minU = slice[0].number_of_units;
            const maxU = slice[slice.length - 1].number_of_units;
            const allScores = slice.flatMap((c) => {
              const key = c.community_name.trim().toLowerCase();
              return communityScores[key] || [];
            });
            const p = allScores.filter((n) => n >= 9).length;
            const d = allScores.filter((n) => n <= 6).length;
            const nps =
              allScores.length > 0 ? Math.round(((p - d) / allScores.length) * 100) : null;
            sizePerformance.push({
              name: labels[si],
              range: `${minU}-${maxU}`,
              nps,
              respondents: allScores.length,
              communities: slice.length,
            });
          }
        }
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
        response_rate:
          round.members_invited > 0
            ? Math.round((completed.length / round.members_invited) * 100)
            : 0,
        community_cohorts: cohorts,
        community_details: communityDetails,
        word_frequencies: round.word_frequencies || null,
        revenue_at_risk: revenueAtRisk,
        manager_performance: managerPerformance,
        location_performance: locationPerformance,
        size_performance: sizePerformance,
      });
    }

    res.json({ is_paid_tier: isPaidTier, rounds: trendsData });
  } catch (err) {
    logger.error({ err }, "Error fetching trends");
    res.status(500).json({ error: err.message });
  }
});

// Round dashboard — single endpoint for all round data
router.get("/:id/dashboard", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    // Optional filters — applied to sessions, alerts, and analytics
    const filterCommunityId = req.query.community_id ? Number(req.query.community_id) : null;
    const filterManager = req.query.manager || null;
    const filterPropertyType = req.query.property_type || null;
    const filterLocation = req.query.location || null;

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    // Check if snapshots exist for this round (concluded rounds with post-migration data)
    const hasSnapshots = await db.get(
      "SELECT 1 FROM round_community_snapshots WHERE round_id = ? LIMIT 1",
      [roundId]
    );
    const useSnapshots = !!(hasSnapshots && round.status === "concluded");

    // Build filter conditions for sessions
    let sessionFilterSQL = "";
    const sessionParams = [roundId, req.clientId, req.isTestMode];

    if (filterCommunityId) {
      sessionFilterSQL += " AND s.community_id = ?";
      sessionParams.push(filterCommunityId);
    }
    if (filterManager) {
      if (useSnapshots) {
        sessionFilterSQL +=
          " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
        sessionParams.push(filterManager, roundId);
      } else {
        sessionFilterSQL +=
          " AND s.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
        sessionParams.push(filterManager, req.clientId);
      }
    }
    if (filterPropertyType) {
      if (useSnapshots) {
        sessionFilterSQL +=
          " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
        sessionParams.push(filterPropertyType, roundId);
      } else {
        sessionFilterSQL +=
          " AND s.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
        sessionParams.push(filterPropertyType, req.clientId);
      }
    }
    if (filterLocation) {
      sessionFilterSQL +=
        " AND s.community_id IN (SELECT c.id FROM communities c JOIN locations l ON l.id = c.location_id WHERE l.name = ? AND c.client_id = ?)";
      sessionParams.push(filterLocation, req.clientId);
    }

    // All sessions for this round (with optional filters)
    const sessions = await db.all(
      `SELECT s.id, s.email, s.nps_score, s.completed, s.summary,
              COALESCE(sc.community_name, s.community_name) as community_name,
              COALESCE(loc.name, s.management_company) as location_name,
              s.created_at, u.first_name, u.last_name
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN communities sc ON sc.id = s.community_id
       LEFT JOIN locations loc ON loc.id = sc.location_id
       WHERE s.round_id = ? AND s.client_id = ? AND s.is_mock IS NOT TRUE AND s.is_test = ?${sessionFilterSQL}
       ORDER BY s.created_at DESC`,
      sessionParams
    );

    // Invited users (from invitation_logs) — same filters applied
    let invitedFilterSQL = "";
    const invitedParams = [roundId, req.isTestMode];
    if (filterCommunityId) {
      invitedFilterSQL += " AND u.community_id = ?";
      invitedParams.push(filterCommunityId);
    }
    if (filterManager) {
      if (useSnapshots) {
        invitedFilterSQL +=
          " AND u.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
        invitedParams.push(filterManager, roundId);
      } else {
        invitedFilterSQL +=
          " AND u.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
        invitedParams.push(filterManager, req.clientId);
      }
    }
    if (filterPropertyType) {
      if (useSnapshots) {
        invitedFilterSQL +=
          " AND u.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
        invitedParams.push(filterPropertyType, roundId);
      } else {
        invitedFilterSQL +=
          " AND u.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
        invitedParams.push(filterPropertyType, req.clientId);
      }
    }

    const invitedUsers = await db.all(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              COALESCE(c.community_name, u.community_name) as community_name
       FROM invitation_logs il
       JOIN users u ON u.id = il.user_id
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE il.round_id = ? AND il.is_test = ? AND il.email_status = 'sent'${invitedFilterSQL}`,
      invitedParams
    );

    // Non-responders: invited but no completed session
    const completedUserIds = new Set(sessions.filter((s) => s.completed).map((s) => s.email));
    const nonResponders = invitedUsers.filter((u) => !completedUserIds.has(u.email));

    // NPS calculations
    const completedSessions = sessions.filter((s) => s.completed && s.nps_score != null);
    const npsScores = completedSessions.map((s) => s.nps_score);
    const promoters = npsScores.filter((n) => n >= 9).length;
    const passives = npsScores.filter((n) => n >= 7 && n <= 8).length;
    const detractors = npsScores.filter((n) => n <= 6).length;
    const npsScore =
      npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : null;

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

    // Community analytics for paid tiers
    let communityAnalytics = null;
    const planResult = await db.get(
      `SELECT sp.name as plan_name FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ?`,
      [req.clientId]
    );
    const isPaidTier = planResult && planResult.plan_name !== "free";

    if (communityCohorts.length > 0) {
      const communityData = useSnapshots
        ? await db.all(
            `SELECT community_id as id, community_name, contract_value, community_manager_name, property_type, number_of_units
             FROM round_community_snapshots WHERE round_id = ? AND status = 'active'`,
            [roundId]
          )
        : await db.all(
            `SELECT id, community_name, contract_value, community_manager_name, property_type, number_of_units
             FROM communities WHERE client_id = ? AND status = 'active'`,
            [req.clientId]
          );

      // Build lookup by normalized name
      const communityLookup = {};
      for (const c of communityData) {
        communityLookup[c.community_name.trim().toLowerCase()] = c;
      }

      // Build community_name -> individual NPS scores for this round
      const communityScores = {};
      for (const s of completedSessions) {
        if (s.community_name) {
          const key = s.community_name.trim().toLowerCase();
          if (!communityScores[key]) communityScores[key] = [];
          communityScores[key].push(s.nps_score);
        }
      }

      // Enrich cohorts with business data
      const enrichedCohorts = communityCohorts.map((cohort) => {
        const meta = communityLookup[cohort.name.trim().toLowerCase()];
        return {
          ...cohort,
          contract_value: meta?.contract_value ? Number(meta.contract_value) : null,
          community_manager_name: meta?.community_manager_name || null,
          property_type: meta?.property_type || null,
          number_of_units: meta?.number_of_units ? Number(meta.number_of_units) : null,
        };
      });

      // Revenue at Risk — use only communities present in filtered results
      const filteredCommunityNames = new Set(
        enrichedCohorts.map((c) => c.name.trim().toLowerCase())
      );
      const filteredCommunityData = communityData.filter((c) =>
        filteredCommunityNames.has(c.community_name.trim().toLowerCase())
      );
      const totalPortfolioValue = filteredCommunityData.reduce(
        (sum, c) => sum + (Number(c.contract_value) || 0),
        0
      );
      const atRiskCommunities = enrichedCohorts.filter(
        (c) => c.cohort === "detractor" && c.contract_value
      );
      const revenueAtRisk = atRiskCommunities.reduce((sum, c) => sum + c.contract_value, 0);

      // Manager Performance: group scores by manager
      const managerScores = {};
      for (const c of communityData) {
        const mgr = c.community_manager_name;
        if (!mgr) continue;
        const key = c.community_name.trim().toLowerCase();
        const scores = communityScores[key] || [];
        if (!managerScores[mgr]) managerScores[mgr] = { communities: [], scores: [] };
        managerScores[mgr].communities.push(c.community_name);
        managerScores[mgr].scores.push(...scores);
      }

      const managerPerformance = Object.entries(managerScores)
        .filter(([_, data]) => data.scores.length > 0)
        .map(([manager, data]) => {
          const p = data.scores.filter((n) => n >= 9).length;
          const d = data.scores.filter((n) => n <= 6).length;
          const nps = Math.round(((p - d) / data.scores.length) * 100);
          return {
            manager,
            communities: data.communities.length,
            nps,
            respondents: data.scores.length,
          };
        })
        .sort((a, b) => b.nps - a.nps);

      // Property Type Analysis
      const typeScores = {};
      for (const c of communityData) {
        if (!c.property_type) continue;
        const key = c.community_name.trim().toLowerCase();
        const scores = communityScores[key] || [];
        if (!typeScores[c.property_type])
          typeScores[c.property_type] = { communities: 0, scores: [] };
        if (scores.length > 0) {
          typeScores[c.property_type].communities++;
          typeScores[c.property_type].scores.push(...scores);
        }
      }

      const propertyTypeAnalysis = Object.entries(typeScores)
        .filter(([_, data]) => data.scores.length > 0)
        .map(([type, data]) => {
          const p = data.scores.filter((n) => n >= 9).length;
          const d = data.scores.filter((n) => n <= 6).length;
          const nps = Math.round(((p - d) / data.scores.length) * 100);
          return {
            property_type: type,
            communities: data.communities,
            nps,
            respondents: data.scores.length,
          };
        })
        .sort((a, b) => b.nps - a.nps);

      // Size-Based Trends — group into 4-5 cohorts by unit count
      const withUnits = enrichedCohorts
        .filter((c) => c.number_of_units)
        .sort((a, b) => a.number_of_units - b.number_of_units);
      let sizeTrends = [];
      if (withUnits.length >= 4) {
        const cohortCount = withUnits.length >= 10 ? 5 : 4;
        const perCohort = Math.ceil(withUnits.length / cohortCount);
        for (let i = 0; i < cohortCount; i++) {
          const slice = withUnits.slice(i * perCohort, (i + 1) * perCohort);
          if (slice.length === 0) continue;
          const minUnits = slice[0].number_of_units;
          const maxUnits = slice[slice.length - 1].number_of_units;
          const allScores = slice.flatMap((c) => {
            const key = c.name.trim().toLowerCase();
            return communityScores[key] || [];
          });
          const p = allScores.filter((n) => n >= 9).length;
          const d = allScores.filter((n) => n <= 6).length;
          const nps = allScores.length > 0 ? Math.round(((p - d) / allScores.length) * 100) : null;
          const labels = ["Small", "Medium", "Large", "Very Large", "Extra Large"];
          sizeTrends.push({
            name: `${labels[i]} (${minUnits}-${maxUnits} units)`,
            units: Math.round(slice.reduce((s, c) => s + c.number_of_units, 0) / slice.length),
            communities: slice.length,
            respondents: allScores.length,
            nps,
          });
        }
      } else {
        // Too few communities for cohorts — show individually
        sizeTrends = withUnits.map((c) => ({
          name: c.name,
          units: c.number_of_units,
          median: c.median,
          cohort: c.cohort,
          respondents: c.respondents,
        }));
      }

      // Location Performance: group scores by management_company (displayed as "Location")
      const locationScores = {};
      for (const s of completedSessions) {
        const loc = s.location_name;
        if (!loc) continue;
        if (!locationScores[loc]) locationScores[loc] = [];
        locationScores[loc].push(s.nps_score);
      }

      const locationPerformance = Object.entries(locationScores)
        .filter(([_, scores]) => scores.length > 0)
        .map(([location, scores]) => {
          const p = scores.filter((n) => n >= 9).length;
          const d = scores.filter((n) => n <= 6).length;
          const nps = Math.round(((p - d) / scores.length) * 100);
          return { location, nps, respondents: scores.length };
        })
        .sort((a, b) => b.nps - a.nps);

      communityAnalytics = {
        revenue_at_risk: {
          total_portfolio_value: totalPortfolioValue,
          at_risk_value: revenueAtRisk,
          percent_at_risk:
            totalPortfolioValue > 0 ? Math.round((revenueAtRisk / totalPortfolioValue) * 100) : 0,
          at_risk_communities: atRiskCommunities
            .sort(
              (a, b) =>
                a.median - b.median ||
                (Number(b.contract_value) || 0) - (Number(a.contract_value) || 0)
            )
            .map((c) => ({
              name: c.name,
              contract_value: c.contract_value,
              median: c.median,
              respondents: c.respondents,
            })),
        },
        manager_performance: managerPerformance,
        location_performance: locationPerformance,
        property_type_analysis: propertyTypeAnalysis,
        size_trends: sizeTrends,
      };
    }

    // Filter options for paid tier (return available values for dropdowns)
    let filterOptions = null;
    {
      const allCommunities = useSnapshots
        ? await db.all(
            "SELECT community_id as id, community_name, community_manager_name, property_type FROM round_community_snapshots WHERE round_id = ? AND status = 'active' ORDER BY community_name",
            [roundId]
          )
        : await db.all(
            "SELECT id, community_name, community_manager_name, property_type FROM communities WHERE client_id = ? AND status = 'active' ORDER BY community_name",
            [req.clientId]
          );
      const managers = [
        ...new Set(allCommunities.map((c) => c.community_manager_name).filter(Boolean)),
      ].sort();
      const propertyTypes = [
        ...new Set(allCommunities.map((c) => c.property_type).filter(Boolean)),
      ].sort();
      const locationsList = await db.all(
        "SELECT DISTINCT l.name FROM locations l JOIN communities c ON c.location_id = l.id WHERE c.client_id = ? AND c.status = 'active' ORDER BY l.name",
        [req.clientId]
      );
      filterOptions = {
        communities: allCommunities.map((c) => ({ id: c.id, name: c.community_name })),
        managers,
        property_types: propertyTypes,
        locations: locationsList.map((l) => l.name),
      };
    }

    // Critical alerts for this round (filtered by same criteria as sessions)
    let alertFilterSQL = "";
    const alertParams = [roundId, req.clientId, req.isTestMode];
    if (filterCommunityId) {
      alertFilterSQL += " AND u.community_id = ?";
      alertParams.push(filterCommunityId);
    }
    if (filterManager) {
      alertFilterSQL +=
        " AND u.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
      alertParams.push(filterManager, req.clientId);
    }
    if (filterPropertyType) {
      alertFilterSQL +=
        " AND u.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
      alertParams.push(filterPropertyType, req.clientId);
    }
    if (filterLocation) {
      alertFilterSQL +=
        " AND u.community_id IN (SELECT cm.id FROM communities cm JOIN locations l ON l.id = cm.location_id WHERE l.name = ? AND cm.client_id = ?)";
      alertParams.push(filterLocation, req.clientId);
    }
    const alerts = await db.all(
      `SELECT ca.*, u.first_name, u.last_name, u.email as user_email,
              COALESCE(c.community_name, u.community_name) as alert_community
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE ca.round_id = ? AND ca.client_id = ? AND ca.is_test = ?${alertFilterSQL}
       ORDER BY ca.created_at DESC`,
      alertParams
    );

    // Word frequencies (stored for concluded unless filtered, computed live for active or filtered)
    const hasFilters = filterCommunityId || filterManager || filterPropertyType || filterLocation;
    let wordFrequencies = null;
    if (round.word_frequencies && !hasFilters) {
      wordFrequencies = round.word_frequencies;
    } else if (round.status === "in_progress" || hasFilters) {
      // Compute live from user messages (with same filters)
      const wfParams = [roundId, req.clientId, req.isTestMode];
      let wfFilterSQL = "";
      if (filterCommunityId) {
        wfFilterSQL += " AND s.community_id = ?";
        wfParams.push(filterCommunityId);
      }
      if (filterManager) {
        if (useSnapshots) {
          wfFilterSQL +=
            " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
          wfParams.push(filterManager, roundId);
        } else {
          wfFilterSQL +=
            " AND s.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
          wfParams.push(filterManager, req.clientId);
        }
      }
      if (filterPropertyType) {
        if (useSnapshots) {
          wfFilterSQL +=
            " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
          wfParams.push(filterPropertyType, roundId);
        } else {
          wfFilterSQL +=
            " AND s.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
          wfParams.push(filterPropertyType, req.clientId);
        }
      }
      const userMessages = await db.all(
        `SELECT m.content
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.round_id = ? AND s.client_id = ? AND s.is_mock IS NOT TRUE AND s.is_test = ? AND m.role = 'user'${wfFilterSQL}`,
        wfParams
      );
      wordFrequencies = computeLiveWordFrequencies(userMessages);
    }

    // Email delivery summary for this round
    const deliveryStats = await db.all(
      `SELECT email_status, COUNT(*) as count
       FROM invitation_logs
       WHERE round_id = ? AND is_test = ?
       GROUP BY email_status`,
      [roundId, req.isTestMode]
    );
    const delivery = { sent: 0, delivered: 0, bounced: 0, complained: 0 };
    for (const row of deliveryStats) {
      if (row.email_status === "sent") delivery.sent += row.count;
      else if (row.email_status === "delivered") delivery.delivered += row.count;
      else if (row.email_status === "bounced") delivery.bounced += row.count;
      else if (row.email_status === "complained") delivery.complained += row.count;
    }
    delivery.total = delivery.sent + delivery.delivered + delivery.bounced + delivery.complained;

    // Insights (concluded rounds only)
    const insights = round.insights_json || null;

    // Recommended actions + their logged-action status. The Round
    // Results page uses this to show "of the 3 AI-recommended actions,
    // 1 is in progress, 1 hasn't been logged yet". Without this view
    // there's no visual link between a round's AI suggestions and the
    // Actions screen — operators had to navigate over and remember
    // which round each pick came from.
    //
    // Matching: actions.theme === recommended_action.action (the full
    // recommendation text). The /api/admin/actions/brief endpoint uses
    // the same convention, so logging from either surface stays in
    // sync.
    let recommendedActionsStatus = [];
    if (insights?.recommended_actions && Array.isArray(insights.recommended_actions)) {
      const recs = insights.recommended_actions;
      const themes = recs.map((r) => r.action || r.theme).filter(Boolean);
      const loggedActions =
        themes.length > 0
          ? await db.all(
              "SELECT id, theme, status FROM actions WHERE client_id = ? AND theme = ANY($2::text[])",
              [req.clientId, themes]
            )
          : [];
      const loggedByTheme = new Map(loggedActions.map((a) => [a.theme, a]));

      // Accept/reject decisions for this round's picks. Joined here so
      // the frontend can show the right UI state per pick without a
      // second roundtrip.
      const decisions = await db.all(
        `SELECT theme, decision, decided_at FROM recommendation_decisions
         WHERE round_id = ? AND client_id = ?`,
        [roundId, req.clientId]
      );
      const decisionByTheme = new Map(decisions.map((d) => [d.theme, d]));

      recommendedActionsStatus = recs.map((r, i) => {
        const theme = r.action || r.theme;
        const logged = theme ? loggedByTheme.get(theme) : null;
        const decision = theme ? decisionByTheme.get(theme) : null;
        return {
          rank: i + 1,
          action: theme || `Pick ${i + 1}`,
          priority: r.priority || "medium",
          impact: r.impact || null,
          rationale: r.rationale || null,
          // Surfaces drive the NPS-lift projection on Round Results
          // and the "N mentions · M communities · NPS X when raised"
          // metric line on Home. Older insights generated before
          // these prompts shipped won't carry them; the frontend
          // handles null gracefully.
          affected_count: typeof r.affected_count === "number" ? r.affected_count : null,
          affected_detractor_count:
            typeof r.affected_detractor_count === "number" ? r.affected_detractor_count : null,
          mentions: typeof r.mentions === "number" ? r.mentions : null,
          community_count: typeof r.community_count === "number" ? r.community_count : null,
          nps_when_raised: typeof r.nps_when_raised === "number" ? r.nps_when_raised : null,
          logged_action_id: logged?.id || null,
          logged_action_status: logged?.status || null,
          decision: decision?.decision || null,
          decided_at: decision?.decided_at || null,
        };
      });
    }

    // Interview summary (customer's stated goals)
    const interviewResult = await db.get(
      "SELECT interview_summary FROM admin_interviews WHERE client_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
      [req.clientId]
    );

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
        percentage:
          invitedUsers.length > 0
            ? Math.round((completedSessions.length / invitedUsers.length) * 100)
            : 0,
      },
      sessions,
      non_responders: nonResponders,
      community_cohorts: communityCohorts,
      is_paid_tier: isPaidTier,
      community_analytics: communityAnalytics,
      filter_options: filterOptions,
      alerts,
      word_frequencies: wordFrequencies,
      insights,
      recommended_actions_status: recommendedActionsStatus,
      interview_summary: interviewResult?.interview_summary || null,
      delivery,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching round dashboard");
    res.status(500).json({ error: err.message });
  }
});

// Export round results as CSV
router.get("/:id/export", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT id, round_number FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    const sessions = await db.all(
      `SELECT s.email, s.nps_score, s.completed, s.summary,
              COALESCE(sc.community_name, s.community_name) as community_name,
              s.created_at, u.first_name, u.last_name
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN communities sc ON sc.id = s.community_id
       WHERE s.round_id = ? AND s.client_id = ? AND s.is_mock IS NOT TRUE AND s.is_test = ?
       ORDER BY s.created_at DESC`,
      [roundId, req.clientId, req.isTestMode]
    );

    const header = "first_name,last_name,email,community_name,nps_score,completed,summary,date";
    const rows = sessions.map((s) =>
      [
        s.first_name || "",
        s.last_name || "",
        s.email || "",
        s.community_name || "",
        s.nps_score ?? "",
        s.completed ? "Yes" : "No",
        s.summary || "",
        s.created_at ? new Date(s.created_at).toLocaleDateString("en-US") : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=round-${round.round_number}-results.csv`
    );
    res.send([header, ...rows].join("\n"));
  } catch (err) {
    logger.error({ err }, "Error exporting round results");
    res.status(500).json({ error: err.message });
  }
});

// Reschedule a planned round
router.patch("/:id/reschedule", async (req, res) => {
  try {
    const roundId = Number(req.params.id);
    const { scheduled_date } = req.body;

    if (!scheduled_date) {
      return res.status(400).json({ error: "scheduled_date is required" });
    }

    const parsedDate = new Date(scheduled_date + "T00:00:00Z");
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    const round = await db.get(
      "SELECT id, status FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });
    if (round.status !== "planned") {
      return res.status(400).json({ error: "Only planned rounds can be rescheduled" });
    }

    await db.run(
      "UPDATE survey_rounds SET scheduled_date = ?, admin_reminder_14_sent = FALSE, admin_reminder_7_sent = FALSE, admin_reminder_1_sent = FALSE WHERE id = ?",
      [scheduled_date, roundId]
    );

    const updated = await db.get("SELECT * FROM survey_rounds WHERE id = ?", [roundId]);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Error rescheduling round");
    res.status(500).json({ error: err.message });
  }
});

// Close a round early
router.post("/:id/close", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });
    if (round.status !== "in_progress") {
      return res.status(400).json({ error: "Only in-progress rounds can be closed" });
    }

    await db.run(
      "UPDATE survey_rounds SET status = 'concluded', concluded_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
      [roundId, req.isTestMode]
    );

    // Snapshot all client communities for historical dashboard data
    await db.run(
      `INSERT INTO round_community_snapshots
        (round_id, community_id, community_name, contract_value, community_manager_name,
         property_type, number_of_units, contract_renewal_date, contract_month_to_month, status)
       SELECT $1, c.id, c.community_name, c.contract_value, c.community_manager_name,
              c.property_type, c.number_of_units, c.contract_renewal_date, c.contract_month_to_month, c.status
       FROM communities c WHERE c.client_id = $2
       ON CONFLICT (round_id, community_id) DO NOTHING`,
      [roundId, req.clientId]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "close_round_early",
      entityType: "survey_round",
      entityId: roundId,
      clientId: req.clientId,
      metadata: { round_number: round.round_number },
    });

    // Generate insights asynchronously
    generateRoundInsights(roundId, req.clientId).catch((err) =>
      logger.error(`Failed to generate insights for round ${roundId}: %s`, err.message)
    );

    // Notify admins asynchronously
    const completedCount = await db.get(
      "SELECT COUNT(*) as count FROM sessions WHERE round_id = ? AND client_id = ? AND completed = TRUE AND is_mock IS NOT TRUE AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    notifyRoundConcluded({
      clientId: req.clientId,
      roundNumber: round.round_number,
      totalResponses: completedCount?.count || 0,
      totalInvited: round.members_invited || 0,
      db,
    }).catch((err) =>
      logger.error("Failed to send round conclusion notifications: %s", err.message)
    );

    res.json({ ok: true, message: "Round closed. AI insights are being generated." });
  } catch (err) {
    logger.error({ err }, "Error closing round");
    res.status(500).json({ error: err.message });
  }
});

// Regenerate insights for a concluded round
router.post("/:id/regenerate-insights", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
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
    logger.error(
      { err: { message: err.message, stack: err.stack, status: err.status } },
      "Error regenerating insights"
    );
    res.status(500).json({ error: err.message });
  }
});

// Background email sending for round launch
async function processEmailJob(
  jobId,
  roundId,
  members,
  closesAt,
  clientId,
  userId,
  userEmail,
  roundNumber,
  companyName,
  isTestMode
) {
  let sentCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < members.length; i++) {
      const member = members[i];

      try {
        const token = crypto.randomUUID();

        await db.run(
          "UPDATE users SET invitation_token = ?, invitation_token_expires = ?, last_invited_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
          [token, closesAt.toISOString(), member.id, isTestMode]
        );

        if (isTestMode) {
          // In test mode, skip actual email sending and log as simulated
          await db.run(
            "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, round_id, is_test) VALUES (?, ?, ?, ?, ?, ?)",
            [member.id, clientId, userId, "simulated", roundId, isTestMode]
          );
        } else {
          const emailResult = await sendInvitation(member, token, {
            closesAt: closesAt.toISOString(),
            roundNumber,
            companyName,
            clientId,
          });

          await db.run(
            "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, round_id, resend_email_id, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [member.id, clientId, userId, "sent", roundId, emailResult?.id || null, isTestMode]
          );
        }

        sentCount++;
      } catch (err) {
        logger.error({ err }, `Failed to send invitation to ${member.email}`);

        try {
          await db.run(
            "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, error_message, round_id, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [member.id, clientId, userId, "failed", err.message, roundId, isTestMode]
          );
        } catch (logErr) {
          logger.error({ err: logErr }, "Failed to log invitation error");
        }

        failedCount++;
      }

      // Update job progress every 10 emails (or on last email)
      if ((i + 1) % 10 === 0 || i === members.length - 1) {
        await db.run(
          "UPDATE email_jobs SET sent_count = ?, failed_count = ? WHERE id = ? AND is_test = ?",
          [sentCount, failedCount, jobId, isTestMode]
        );
      }

      // Rate limit: 500ms between emails (skip in test mode)
      if (i < members.length - 1 && !isTestMode) {
        await sleep(500);
      }
    }

    // Mark job completed
    await db.run(
      "UPDATE email_jobs SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
      [sentCount, failedCount, jobId, isTestMode]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: userId,
      actorEmail: userEmail,
      action: "launch_round",
      entityType: "survey_round",
      entityId: roundId,
      clientId,
      metadata: { sent: sentCount, failed: failedCount, round_number: roundNumber },
    });

    // Brief delay after invitation emails before sending admin notifications
    await sleep(1000);
    notifyRoundLaunched({
      clientId,
      roundNumber,
      membersInvited: sentCount,
      closesAt: closesAt.toISOString(),
      db,
    }).catch((err) => logger.error("Failed to send round launch notifications: %s", err.message));
  } catch (err) {
    logger.error({ err }, "Email job fatal error");
    await db
      .run(
        "UPDATE email_jobs SET status = 'failed', sent_count = ?, failed_count = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
        [sentCount, failedCount, err.message, jobId, isTestMode]
      )
      .catch(() => {});
  }
}

// Launch a survey round
router.post("/:id/launch", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    // Validate round belongs to client and is planned
    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );

    if (!round) {
      return res.status(404).json({ error: "Survey round not found" });
    }

    if (round.status !== "planned") {
      return res.status(400).json({ error: `Cannot launch a round that is ${round.status}` });
    }

    // Check no other round is in progress
    const activeRound = await db.get(
      "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'in_progress' AND is_test = ?",
      [req.clientId, req.isTestMode]
    );

    if (activeRound) {
      return res.status(400).json({
        error:
          "Another survey round is already in progress. Wait for it to conclude before launching a new one.",
      });
    }

    // Get client company name for emails
    const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [req.clientId]);
    const companyName = client?.company_name || "your management company";

    // Get active board members only
    const members = await db.all(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              COALESCE(c.community_name, u.community_name) as community_name,
              u.management_company
       FROM users u
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE u.client_id = ? AND u.active = TRUE AND u.is_test = ?
         AND (u.community_id IS NULL OR c.status = 'active')`,
      [req.clientId, req.isTestMode]
    );

    if (members.length === 0) {
      return res.status(400).json({
        error: "No active board members found. Add board members before launching a survey round.",
      });
    }

    // Check member limit
    const sub = await db.get(
      `SELECT sp.member_limit FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = $1`,
      [req.clientId]
    );
    if (sub?.member_limit && members.length > sub.member_limit) {
      return res.status(400).json({
        error: `You have ${members.length} board members but your plan supports ${sub.member_limit}. Remove board members or upgrade your plan before launching.`,
      });
    }

    // Calculate close date (30 days from now)
    const now = new Date();
    const closesAt = new Date(now);
    closesAt.setDate(closesAt.getDate() + 30);

    // Update round status
    await db.run(
      "UPDATE survey_rounds SET status = 'in_progress', launched_at = CURRENT_TIMESTAMP, closes_at = ?, members_invited = ? WHERE id = ? AND is_test = ?",
      [closesAt.toISOString(), members.length, roundId, req.isTestMode]
    );

    // Auto-replenish: ensure cadence number of planned rounds always exist
    const cadenceSub = await db.get(
      "SELECT cs.survey_cadence FROM client_subscriptions cs WHERE cs.client_id = ? AND cs.status = 'active'",
      [req.clientId]
    );
    const cadence = cadenceSub?.survey_cadence || 2;
    const intervalMonths = cadence === 4 ? 3 : 6;
    const plannedCount = await db.get(
      "SELECT COUNT(*) as count FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ?",
      [req.clientId, req.isTestMode]
    );
    if ((plannedCount?.count || 0) < cadence) {
      const lastPlanned = await db.get(
        "SELECT round_number, scheduled_date FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ? ORDER BY round_number DESC LIMIT 1",
        [req.clientId, req.isTestMode]
      );
      const anchorDate = lastPlanned ? new Date(lastPlanned.scheduled_date) : closesAt;
      const maxNum = lastPlanned ? lastPlanned.round_number : round.round_number;
      const toCreate = cadence - (plannedCount?.count || 0);
      for (let i = 0; i < toCreate; i++) {
        const nextDate = new Date(anchorDate);
        nextDate.setMonth(nextDate.getMonth() + intervalMonths * (i + 1));
        await db.run(
          "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status, is_test) VALUES (?, ?, ?, 'planned', ?)",
          [req.clientId, maxNum + i + 1, nextDate.toISOString(), req.isTestMode]
        );
      }
    }

    // Create background email job
    const jobResult = await db.run(
      "INSERT INTO email_jobs (client_id, round_id, total_count, is_test) VALUES (?, ?, ?, ?)",
      [req.clientId, roundId, members.length, req.isTestMode]
    );
    const jobId = jobResult.lastInsertRowid;

    // Return immediately — emails send in background
    res.json({
      ok: true,
      job_id: jobId,
      total: members.length,
      closes_at: closesAt.toISOString(),
    });

    // Fire-and-forget background processing
    processEmailJob(
      jobId,
      roundId,
      members,
      closesAt,
      req.clientId,
      req.userId,
      req.userEmail,
      round.round_number,
      companyName,
      req.isTestMode
    ).catch((err) => logger.error({ err }, "Email job failed"));
  } catch (err) {
    logger.error({ err }, "Error launching round");
    res.status(500).json({ error: err.message });
  }
});

// Get active email job for this client (for page load resume)
// Must be before :jobId route so "active" isn't matched as a param
router.get("/email-jobs/active", async (req, res) => {
  try {
    const job = await db.get(
      "SELECT id, round_id, status, total_count, sent_count, failed_count, created_at FROM email_jobs WHERE client_id = ? AND status = 'in_progress' AND is_test = ? ORDER BY created_at DESC LIMIT 1",
      [req.clientId, req.isTestMode]
    );
    res.json({ job: job || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get email job status (for polling)
router.get("/email-jobs/:jobId", async (req, res) => {
  try {
    const job = await db.get(
      "SELECT id, status, total_count, sent_count, failed_count, error_message, completed_at, created_at FROM email_jobs WHERE id = ? AND client_id = ? AND is_test = ?",
      [Number(req.params.jobId), req.clientId, req.isTestMode]
    );
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recalculate planned rounds after cadence change
router.post("/recalculate", async (req, res) => {
  try {
    // Delete all planned rounds and rebuild
    await db.run(
      "DELETE FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ?",
      [req.clientId, req.isTestMode]
    );

    // Get the latest non-planned round as anchor
    const lastRound = await db.get(
      `SELECT * FROM survey_rounds WHERE client_id = ? AND status IN ('in_progress', 'concluded') AND is_test = ?
       ORDER BY round_number DESC LIMIT 1`,
      [req.clientId, req.isTestMode]
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

    const baseDate = lastRound
      ? new Date(lastRound.closes_at || lastRound.launched_at || lastRound.scheduled_date)
      : new Date();
    const maxRoundNum = lastRound ? lastRound.round_number : 0;
    const now = new Date();

    // Always create `cadence` planned rounds into the future
    for (let i = 0; i < cadence; i++) {
      const roundDate = new Date(baseDate);
      roundDate.setMonth(roundDate.getMonth() + (i + 1) * monthsBetween);
      const finalDate =
        roundDate <= now ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 * (i + 1)) : roundDate;

      await db.run(
        "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status, is_test) VALUES (?, ?, ?, 'planned', ?)",
        [req.clientId, maxRoundNum + i + 1, finalDate.toISOString().split("T")[0], req.isTestMode]
      );
    }

    // Return updated rounds
    const rounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true AND s.is_mock IS NOT TRUE AND s.is_test = ?) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent' AND il.is_test = ?) as invitations_sent
       FROM survey_rounds sr
       WHERE sr.client_id = ? AND sr.is_test = ?
       ORDER BY sr.round_number`,
      [req.isTestMode, req.isTestMode, req.clientId, req.isTestMode]
    );

    res.json(rounds);
  } catch (err) {
    logger.error({ err }, "Error recalculating rounds");
    res.status(500).json({ error: err.message });
  }
});

export default router;
