import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { sendInvitation, notifyRoundLaunched, notifyRoundConcluded } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { generateRoundInsights, computeLiveWordFrequencies } from "../utils/insightGenerator.js";

const router = Router();
router.use(requireClientAdmin);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get all survey rounds for this client
router.get("/", async (req, res) => {
  try {
    // Auto-fill missing planned rounds if cadence demands more
    const subscription = await db.get(
      `SELECT cs.survey_cadence FROM client_subscriptions cs WHERE cs.client_id = ? AND cs.status = 'active'`,
      [req.clientId]
    );
    const cadence = subscription?.survey_cadence || 2;

    const existingRounds = await db.all(
      "SELECT id, round_number, status, launched_at FROM survey_rounds WHERE client_id = ? ORDER BY round_number",
      [req.clientId]
    );

    if (existingRounds.length > 0 && existingRounds.length < cadence) {
      const maxRoundNum = Math.max(...existingRounds.map(r => r.round_number));
      const lastLaunched = existingRounds.filter(r => r.launched_at).sort((a, b) => new Date(b.launched_at) - new Date(a.launched_at))[0];
      const baseDate = lastLaunched ? new Date(lastLaunched.launched_at) : new Date();
      const intervalMonths = cadence === 4 ? 3 : 6;
      const now = new Date();

      for (let i = existingRounds.length; i < cadence; i++) {
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + intervalMonths * i);
        const finalDate = nextDate <= now
          ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 * (i - existingRounds.length + 1))
          : nextDate;

        await db.run(
          "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status) VALUES (?, ?, ?, 'planned')",
          [req.clientId, maxRoundNum + (i - existingRounds.length + 1), finalDate.toISOString()]
        );
      }
    }

    const rounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent') as invitations_sent,
              (SELECT COUNT(*) FROM critical_alerts ca WHERE ca.round_id = sr.id AND ca.dismissed = FALSE AND COALESCE(ca.solved, FALSE) = FALSE) as active_alert_count,
              (SELECT COUNT(DISTINCT COALESCE(cm.community_name, u.community_name))
               FROM critical_alerts ca
               LEFT JOIN users u ON u.id = ca.user_id
               LEFT JOIN communities cm ON cm.id = u.community_id
               WHERE ca.round_id = sr.id AND ca.dismissed = FALSE AND COALESCE(ca.solved, FALSE) = FALSE) as alert_community_count
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
        `SELECT s.nps_score, COALESCE(sc.community_name, s.community_name) as community_name, s.completed
         FROM sessions s
         LEFT JOIN communities sc ON sc.id = s.community_id
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

    // Optional filters (paid tier only — applied below)
    const filterCommunityId = req.query.community_id ? Number(req.query.community_id) : null;
    const filterManager = req.query.manager || null;
    const filterPropertyType = req.query.property_type || null;

    const round = await db.get(
      "SELECT * FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    // Check if snapshots exist for this round (concluded rounds with post-migration data)
    const hasSnapshots = await db.get(
      "SELECT 1 FROM round_community_snapshots WHERE round_id = ? LIMIT 1", [roundId]
    );
    const useSnapshots = !!(hasSnapshots && round.status === "concluded");

    // Build filter conditions for sessions
    let sessionFilterSQL = "";
    const sessionParams = [roundId, req.clientId];

    if (filterCommunityId) {
      sessionFilterSQL += " AND s.community_id = ?";
      sessionParams.push(filterCommunityId);
    }
    if (filterManager) {
      if (useSnapshots) {
        sessionFilterSQL += " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
        sessionParams.push(filterManager, roundId);
      } else {
        sessionFilterSQL += " AND s.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
        sessionParams.push(filterManager, req.clientId);
      }
    }
    if (filterPropertyType) {
      if (useSnapshots) {
        sessionFilterSQL += " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
        sessionParams.push(filterPropertyType, roundId);
      } else {
        sessionFilterSQL += " AND s.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
        sessionParams.push(filterPropertyType, req.clientId);
      }
    }

    // All sessions for this round (with optional filters)
    const sessions = await db.all(
      `SELECT s.id, s.email, s.nps_score, s.completed, s.summary,
              COALESCE(sc.community_name, s.community_name) as community_name,
              s.created_at, u.first_name, u.last_name
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN communities sc ON sc.id = s.community_id
       WHERE s.round_id = ? AND s.client_id = ?${sessionFilterSQL}
       ORDER BY s.created_at DESC`,
      sessionParams
    );

    // Invited users (from invitation_logs) — same filters applied
    let invitedFilterSQL = "";
    const invitedParams = [roundId];
    if (filterCommunityId) {
      invitedFilterSQL += " AND u.community_id = ?";
      invitedParams.push(filterCommunityId);
    }
    if (filterManager) {
      if (useSnapshots) {
        invitedFilterSQL += " AND u.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
        invitedParams.push(filterManager, roundId);
      } else {
        invitedFilterSQL += " AND u.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
        invitedParams.push(filterManager, req.clientId);
      }
    }
    if (filterPropertyType) {
      if (useSnapshots) {
        invitedFilterSQL += " AND u.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
        invitedParams.push(filterPropertyType, roundId);
      } else {
        invitedFilterSQL += " AND u.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
        invitedParams.push(filterPropertyType, req.clientId);
      }
    }

    const invitedUsers = await db.all(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              COALESCE(c.community_name, u.community_name) as community_name
       FROM invitation_logs il
       JOIN users u ON u.id = il.user_id
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE il.round_id = ? AND il.email_status = 'sent'${invitedFilterSQL}`,
      invitedParams
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

    // Community analytics for paid tiers
    let communityAnalytics = null;
    const planResult = await db.get(
      `SELECT sp.name as plan_name FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ?`,
      [req.clientId]
    );
    const isPaidTier = planResult && planResult.plan_name !== "free";

    if (isPaidTier && communityCohorts.length > 0) {
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
      const enrichedCohorts = communityCohorts.map(cohort => {
        const meta = communityLookup[cohort.name.trim().toLowerCase()];
        return {
          ...cohort,
          contract_value: meta?.contract_value ? Number(meta.contract_value) : null,
          community_manager_name: meta?.community_manager_name || null,
          property_type: meta?.property_type || null,
          number_of_units: meta?.number_of_units ? Number(meta.number_of_units) : null,
        };
      });

      // Revenue at Risk
      const totalPortfolioValue = communityData.reduce((sum, c) => sum + (Number(c.contract_value) || 0), 0);
      const atRiskCommunities = enrichedCohorts.filter(c => c.cohort === "detractor" && c.contract_value);
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
          const p = data.scores.filter(n => n >= 9).length;
          const d = data.scores.filter(n => n <= 6).length;
          const nps = Math.round(((p - d) / data.scores.length) * 100);
          return { manager, communities: data.communities.length, nps, respondents: data.scores.length };
        })
        .sort((a, b) => b.nps - a.nps);

      // Property Type Analysis
      const typeScores = {};
      for (const c of communityData) {
        if (!c.property_type) continue;
        const key = c.community_name.trim().toLowerCase();
        const scores = communityScores[key] || [];
        if (!typeScores[c.property_type]) typeScores[c.property_type] = { communities: 0, scores: [] };
        if (scores.length > 0) {
          typeScores[c.property_type].communities++;
          typeScores[c.property_type].scores.push(...scores);
        }
      }

      const propertyTypeAnalysis = Object.entries(typeScores)
        .filter(([_, data]) => data.scores.length > 0)
        .map(([type, data]) => {
          const p = data.scores.filter(n => n >= 9).length;
          const d = data.scores.filter(n => n <= 6).length;
          const nps = Math.round(((p - d) / data.scores.length) * 100);
          return { property_type: type, communities: data.communities, nps, respondents: data.scores.length };
        })
        .sort((a, b) => b.nps - a.nps);

      // Size-Based Trends
      const sizeTrends = enrichedCohorts
        .filter(c => c.number_of_units)
        .map(c => ({ name: c.name, units: c.number_of_units, median: c.median, cohort: c.cohort, respondents: c.respondents }))
        .sort((a, b) => a.units - b.units);

      communityAnalytics = {
        revenue_at_risk: {
          total_portfolio_value: totalPortfolioValue,
          at_risk_value: revenueAtRisk,
          percent_at_risk: totalPortfolioValue > 0 ? Math.round((revenueAtRisk / totalPortfolioValue) * 100) : 0,
          at_risk_communities: atRiskCommunities.map(c => ({
            name: c.name, contract_value: c.contract_value, median: c.median, respondents: c.respondents,
          })),
        },
        manager_performance: managerPerformance,
        property_type_analysis: propertyTypeAnalysis,
        size_trends: sizeTrends,
      };
    }

    // Filter options for paid tier (return available values for dropdowns)
    let filterOptions = null;
    if (isPaidTier) {
      const allCommunities = useSnapshots
        ? await db.all(
            "SELECT community_id as id, community_name, community_manager_name, property_type FROM round_community_snapshots WHERE round_id = ? AND status = 'active' ORDER BY community_name",
            [roundId]
          )
        : await db.all(
            "SELECT id, community_name, community_manager_name, property_type FROM communities WHERE client_id = ? AND status = 'active' ORDER BY community_name",
            [req.clientId]
          );
      const managers = [...new Set(allCommunities.map(c => c.community_manager_name).filter(Boolean))].sort();
      const propertyTypes = [...new Set(allCommunities.map(c => c.property_type).filter(Boolean))].sort();
      filterOptions = {
        communities: allCommunities.map(c => ({ id: c.id, name: c.community_name })),
        managers,
        property_types: propertyTypes,
      };
    }

    // Critical alerts for this round
    const alerts = await db.all(
      `SELECT ca.*, u.first_name, u.last_name, u.email as user_email,
              COALESCE(c.community_name, u.community_name) as alert_community
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE ca.round_id = ? AND ca.client_id = ?
       ORDER BY ca.created_at DESC`,
      [roundId, req.clientId]
    );

    // Word frequencies (stored for concluded unless filtered, computed live for active or filtered)
    const hasFilters = filterCommunityId || filterManager || filterPropertyType;
    let wordFrequencies = null;
    if (round.word_frequencies && !hasFilters) {
      wordFrequencies = round.word_frequencies;
    } else if (round.status === "in_progress" || hasFilters) {
      // Compute live from user messages (with same filters)
      const wfParams = [roundId, req.clientId];
      let wfFilterSQL = "";
      if (filterCommunityId) {
        wfFilterSQL += " AND s.community_id = ?";
        wfParams.push(filterCommunityId);
      }
      if (filterManager) {
        if (useSnapshots) {
          wfFilterSQL += " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE community_manager_name = ? AND round_id = ?)";
          wfParams.push(filterManager, roundId);
        } else {
          wfFilterSQL += " AND s.community_id IN (SELECT id FROM communities WHERE community_manager_name = ? AND client_id = ?)";
          wfParams.push(filterManager, req.clientId);
        }
      }
      if (filterPropertyType) {
        if (useSnapshots) {
          wfFilterSQL += " AND s.community_id IN (SELECT community_id FROM round_community_snapshots WHERE property_type = ? AND round_id = ?)";
          wfParams.push(filterPropertyType, roundId);
        } else {
          wfFilterSQL += " AND s.community_id IN (SELECT id FROM communities WHERE property_type = ? AND client_id = ?)";
          wfParams.push(filterPropertyType, req.clientId);
        }
      }
      const userMessages = await db.all(
        `SELECT m.content
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.round_id = ? AND s.client_id = ? AND m.role = 'user'${wfFilterSQL}`,
        wfParams
      );
      wordFrequencies = computeLiveWordFrequencies(userMessages);
    }

    // Insights (concluded rounds only)
    const insights = round.insights_json || null;

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
        percentage: invitedUsers.length > 0
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
      interview_summary: interviewResult?.interview_summary || null,
    });
  } catch (err) {
    console.error("Error fetching round dashboard:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export round results as CSV
router.get("/:id/export", async (req, res) => {
  try {
    const roundId = Number(req.params.id);

    const round = await db.get(
      "SELECT id, round_number FROM survey_rounds WHERE id = ? AND client_id = ?",
      [roundId, req.clientId]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    const sessions = await db.all(
      `SELECT s.email, s.nps_score, s.completed, s.summary,
              COALESCE(sc.community_name, s.community_name) as community_name,
              s.created_at, u.first_name, u.last_name
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN communities sc ON sc.id = s.community_id
       WHERE s.round_id = ? AND s.client_id = ?
       ORDER BY s.created_at DESC`,
      [roundId, req.clientId]
    );

    const header = "first_name,last_name,email,community_name,nps_score,completed,summary,date";
    const rows = sessions.map(s =>
      [
        s.first_name || "", s.last_name || "", s.email || "",
        s.community_name || "", s.nps_score ?? "", s.completed ? "Yes" : "No",
        s.summary || "", s.created_at ? new Date(s.created_at).toLocaleDateString("en-US") : "",
      ]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=round-${round.round_number}-results.csv`);
    res.send([header, ...rows].join("\n"));
  } catch (err) {
    console.error("Error exporting round results:", err);
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
      metadata: { round_number: round.round_number }
    });

    // Generate insights asynchronously
    generateRoundInsights(roundId, req.clientId).catch((err) =>
      console.error(`Failed to generate insights for round ${roundId}:`, err.message)
    );

    // Notify admins asynchronously
    const completedCount = await db.get(
      "SELECT COUNT(*) as count FROM sessions WHERE round_id = ? AND client_id = ? AND completed = TRUE",
      [roundId, req.clientId]
    );
    notifyRoundConcluded({
      clientId: req.clientId, roundNumber: round.round_number,
      totalResponses: completedCount?.count || 0, totalInvited: round.members_invited || 0, db
    }).catch(err => console.error("Failed to send round conclusion notifications:", err.message));

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
       WHERE u.client_id = ? AND u.active = TRUE
         AND (u.community_id IS NULL OR c.status = 'active')`,
      [req.clientId]
    );

    if (members.length === 0) {
      return res.status(400).json({ error: "No active board members found. Add board members before launching a survey round." });
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
        error: `You have ${members.length} board members but your plan supports ${sub.member_limit}. Remove board members or upgrade your plan before launching.`
      });
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
        const emailResult = await sendInvitation(member, token, {
          closesAt: closesAt.toISOString(),
          roundNumber: round.round_number,
          companyName,
        });

        // Log invitation with round_id and Resend email ID
        await db.run(
          "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, round_id, resend_email_id) VALUES (?, ?, ?, ?, ?, ?)",
          [member.id, req.clientId, req.userId, "sent", roundId, emailResult?.id || null]
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

    // Notify admins asynchronously
    notifyRoundLaunched({
      clientId: req.clientId, roundNumber: round.round_number,
      membersInvited: sentCount, closesAt: closesAt.toISOString(), db
    }).catch(err => console.error("Failed to send round launch notifications:", err.message));

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
