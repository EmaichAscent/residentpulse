import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword, comparePassword } from "../utils/password.js";
import { sendInvitation, sendNewAdminEmail } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { generateSummary } from "../utils/summaryGenerator.js";
import { isZohoConfigured, createCheckoutSession, updateSubscriptionHostedPage, cancelSubscription, reactivateSubscription } from "../utils/zohoService.js";
import logger from "../utils/logger.js";

const router = Router();

// All admin routes require client admin authentication
router.use(requireClientAdmin);

// Get all sessions with message count (filtered by client)
router.get("/responses", async (req, res) => {
  const sessions = await db.all(
    `SELECT s.*, COALESCE(sc.community_name, s.community_name) as community_name,
            COUNT(m.id) as message_count
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     LEFT JOIN communities sc ON sc.id = s.community_id
     WHERE s.client_id = ? AND s.is_mock IS NOT TRUE AND s.is_test = ?
     GROUP BY s.id, sc.community_name
     ORDER BY s.created_at DESC`,
    [req.clientId, req.isTestMode]
  );
  res.json(sessions);
});

// Get messages for a session (with tenant validation)
router.get("/responses/:id/messages", async (req, res) => {
  const id = Number(req.params.id);

  // Verify session belongs to this client
  const session = await db.get("SELECT id FROM sessions WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const messages = await db.all(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at",
    [id]
  );
  res.json(messages);
});

// Delete a session and its messages (with tenant validation)
router.delete("/responses/:id", async (req, res) => {
  const id = Number(req.params.id);

  // Verify session belongs to this client
  const session = await db.get("SELECT id FROM sessions WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  await db.run("DELETE FROM critical_alerts WHERE source_message_id IN (SELECT id FROM messages WHERE session_id = ?)", [id]);
  await db.run("DELETE FROM messages WHERE session_id = ?", [id]);
  await db.run("DELETE FROM sessions WHERE id = ? AND is_test = ?", [id, req.isTestMode]);
  res.json({ ok: true });
});

// ── Test Mode (Sandbox) ──────────────────────────────────────────────

// Get current mode status
router.get("/mode", async (req, res) => {
  if (process.env.FEATURE_TEST_MODE !== "true") {
    return res.status(404).json({ error: "Not found" });
  }
  const admin = await db.get(
    "SELECT current_mode, first_live_switch_confirmed FROM client_admins WHERE id = ?",
    [req.userId]
  );
  const client = await db.get(
    "SELECT test_mode_activated_at FROM clients WHERE id = ?",
    [req.clientId]
  );
  res.json({
    mode: admin?.current_mode || "live",
    test_mode_activated: !!client?.test_mode_activated_at,
    first_live_switch_confirmed: !!admin?.first_live_switch_confirmed,
  });
});

// Switch mode (live <-> test)
router.post("/mode", async (req, res) => {
  if (process.env.FEATURE_TEST_MODE !== "true") {
    return res.status(404).json({ error: "Not found" });
  }
  const { mode, confirm } = req.body;
  if (!["live", "test"].includes(mode)) {
    return res.status(400).json({ error: "Mode must be 'live' or 'test'" });
  }

  const admin = await db.get(
    "SELECT current_mode, first_live_switch_confirmed FROM client_admins WHERE id = ?",
    [req.userId]
  );
  const client = await db.get(
    "SELECT test_mode_activated_at FROM clients WHERE id = ?",
    [req.clientId]
  );

  // First time switching to test: auto-create sandbox data
  if (mode === "test" && !client.test_mode_activated_at) {
    await db.run("UPDATE clients SET test_mode_activated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.clientId]);

    // Create test community
    const communityResult = await db.run(
      "INSERT INTO communities (client_id, community_name, is_test) VALUES (?, 'Test Community', TRUE)",
      [req.clientId]
    );

    // Create 5 test members
    const testMembers = [
      { first: "Test", last: "Member 1", email: "test1@sandbox.residentpulse.local" },
      { first: "Test", last: "Member 2", email: "test2@sandbox.residentpulse.local" },
      { first: "Test", last: "Member 3", email: "test3@sandbox.residentpulse.local" },
      { first: "Test", last: "Member 4", email: "test4@sandbox.residentpulse.local" },
      { first: "Test", last: "Member 5", email: "test5@sandbox.residentpulse.local" },
    ];
    for (const m of testMembers) {
      await db.run(
        "INSERT INTO users (client_id, first_name, last_name, email, community_id, is_test) VALUES (?, ?, ?, ?, ?, TRUE)",
        [req.clientId, m.first, m.last, m.email, communityResult.lastInsertRowid]
      );
    }

    // Create test survey round (in_progress)
    await db.run(
      `INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date, launched_at, closes_at, is_test)
       VALUES (?, 1, 'in_progress', CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_DATE + INTERVAL '30 days', TRUE)`,
      [req.clientId]
    );

    logger.info({ clientId: req.clientId }, "Test mode sandbox created");
  }

  // First time switching from test to live: require confirmation
  if (mode === "live" && admin.current_mode === "test" && !admin.first_live_switch_confirmed) {
    if (!confirm) {
      return res.json({
        requires_confirmation: true,
        message: "Switching to Live Mode. Your test data stays in test mode — live mode starts fresh with your real members and communities.",
      });
    }
    await db.run("UPDATE client_admins SET first_live_switch_confirmed = TRUE WHERE id = ?", [req.userId]);
  }

  // Update mode
  await db.run("UPDATE client_admins SET current_mode = ? WHERE id = ?", [mode, req.userId]);
  req.session.user.current_mode = mode;

  res.json({ mode, message: `Switched to ${mode} mode.` });
});

// Get client account information (with subscription and usage)
router.get("/account", async (req, res) => {
  const client = await db.get("SELECT * FROM clients WHERE id = ?", [req.clientId]);

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  // Fetch subscription info (custom_member_limit overrides plan default for custom plans)
  const subscription = await db.get(
    `SELECT cs.*, sp.name as plan_name, sp.display_name as plan_display_name,
            COALESCE(cs.custom_member_limit, sp.member_limit) as member_limit,
            sp.survey_rounds_per_year, sp.price_cents,
            cs.cancel_at_period_end, cs.current_period_end
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ?`,
    [req.clientId]
  );

  // Current member count
  const memberCount = await db.get(
    "SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE AND is_test = ?",
    [req.clientId, req.isTestMode]
  );

  // Survey rounds used: prefer survey_rounds table, fall back to legacy invitation_logs counting
  const roundsFromTable = await db.get(
    `SELECT COUNT(*) as count FROM survey_rounds
     WHERE client_id = ? AND status IN ('in_progress', 'concluded') AND is_test = ?`,
    [req.clientId, req.isTestMode]
  );

  let surveyRoundsCount;
  if (roundsFromTable && roundsFromTable.count > 0) {
    surveyRoundsCount = roundsFromTable.count;
  } else {
    const currentYear = new Date().getFullYear();
    const legacyRounds = await db.get(
      `SELECT COUNT(DISTINCT DATE(sent_at)) as count
       FROM invitation_logs
       WHERE client_id = ? AND email_status = 'sent'
       AND EXTRACT(YEAR FROM sent_at) = ? AND is_test = ?`,
      [req.clientId, currentYear, req.isTestMode]
    );
    surveyRoundsCount = legacyRounds?.count || 0;
  }

  // Google review settings
  const reviewEnabled = await db.get(
    "SELECT value FROM settings WHERE key = 'google_review_enabled' AND client_id = ?",
    [req.clientId]
  );
  const reviewUrl = await db.get(
    "SELECT value FROM settings WHERE key = 'google_review_url' AND client_id = ?",
    [req.clientId]
  );

  // Detractor alert threshold
  const detractorSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'detractor_alert_threshold' AND client_id = ?",
    [req.clientId]
  );

  // Don't send logo blob with account data — use separate endpoint
  const { logo_base64, ...clientWithoutLogo } = client;

  res.json({
    ...clientWithoutLogo,
    has_logo: !!logo_base64,
    subscription: subscription || null,
    usage: {
      member_count: memberCount?.count || 0,
      survey_rounds_used: surveyRoundsCount
    },
    google_review_enabled: reviewEnabled?.value === "true",
    google_review_url: reviewUrl?.value || "",
    detractor_alert_threshold: detractorSetting ? Number(detractorSetting.value) : 0,
  });
});

// Update client account information
router.put("/account", async (req, res) => {
  const { company_name, address_line1, address_line2, city, state, zip, phone_number } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: "Company name is required" });
  }

  await db.run(
    "UPDATE clients SET company_name = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, zip = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [company_name, address_line1 || null, address_line2 || null, city || null, state || null, zip || null, phone_number || null, req.clientId]
  );

  res.json({ ok: true });
});

// Update Google review settings (toggle + URL)
router.put("/account/google-review", async (req, res) => {
  const { enabled, url } = req.body;

  // Auto-prepend https:// if missing; block javascript: to prevent XSS
  let trimmedUrl = url?.trim() || "";
  if (trimmedUrl && /^javascript:/i.test(trimmedUrl)) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
    trimmedUrl = "https://" + trimmedUrl;
  }

  try {
    // Upsert enabled setting
    await db.run(
      `INSERT INTO settings (key, value, client_id) VALUES ('google_review_enabled', $1, $2)
       ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value`,
      [String(!!enabled), req.clientId]
    );

    // Upsert URL setting
    await db.run(
      `INSERT INTO settings (key, value, client_id) VALUES ('google_review_url', $1, $2)
       ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value`,
      [trimmedUrl, req.clientId]
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to save Google review settings");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Update detractor alert threshold
router.put("/account/detractor-threshold", async (req, res) => {
  try {
    const { threshold } = req.body;
    const value = Number(threshold) || 0;

    if (value < 0 || value > 10) {
      return res.status(400).json({ error: "Threshold must be between 0 and 10" });
    }

    if (value === 0) {
      await db.run("DELETE FROM settings WHERE key = 'detractor_alert_threshold' AND client_id = ?", [req.clientId]);
    } else {
      await db.run(
        `INSERT INTO settings (key, value, client_id) VALUES ('detractor_alert_threshold', $1, $2)
         ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value`,
        [String(value), req.clientId]
      );
    }

    res.json({ ok: true, threshold: value });
  } catch (err) {
    logger.error({ err }, "Failed to update detractor threshold");
    res.status(500).json({ error: "Failed to update threshold" });
  }
});

// Upload client logo (base64, max 500KB, landscape/square only, max 3:1 aspect ratio)
router.post("/account/logo", async (req, res) => {
  const { logo_base64, logo_mime_type, width, height } = req.body;

  if (!logo_base64 || !logo_mime_type) {
    return res.status(400).json({ error: "Logo data and MIME type are required" });
  }

  // Validate MIME type
  const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml"];
  if (!allowedTypes.includes(logo_mime_type)) {
    return res.status(400).json({ error: "Only PNG, JPG, and SVG files are accepted" });
  }

  // Validate file size (~500KB base64 ≈ ~680KB encoded string)
  if (logo_base64.length > 700000) {
    return res.status(400).json({ error: "Logo file must be under 500KB" });
  }

  // Validate aspect ratio (client sends width/height)
  if (width && height) {
    const ratio = width / height;
    if (ratio < 0.8) {
      return res.status(400).json({ error: "Portrait logos are not supported. Please use a landscape or square image." });
    }
    if (ratio > 3) {
      return res.status(400).json({ error: "Logo is too wide. Maximum aspect ratio is 3:1." });
    }
  }

  await db.run(
    "UPDATE clients SET logo_base64 = ?, logo_mime_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [logo_base64, logo_mime_type, req.clientId]
  );

  res.json({ ok: true });
});

// Serve client logo as image
router.get("/account/logo", async (req, res) => {
  const client = await db.get("SELECT logo_base64, logo_mime_type FROM clients WHERE id = ?", [req.clientId]);
  if (!client?.logo_base64) {
    return res.status(404).json({ error: "No logo uploaded" });
  }

  const buffer = Buffer.from(client.logo_base64, "base64");
  res.setHeader("Content-Type", client.logo_mime_type);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(buffer);
});

// Delete client logo
router.delete("/account/logo", async (req, res) => {
  await db.run(
    "UPDATE clients SET logo_base64 = NULL, logo_mime_type = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [req.clientId]
  );
  res.json({ ok: true });
});

// Update survey cadence and recalculate planned round dates
router.patch("/account/cadence", async (req, res) => {
  const { survey_cadence } = req.body;

  if (![2, 4].includes(survey_cadence)) {
    return res.status(400).json({ error: "Survey cadence must be 2 or 4" });
  }

  // Check plan allows this cadence (free tier limited to 2)
  const subscription = await db.get(
    `SELECT cs.survey_cadence as current_cadence, sp.survey_rounds_per_year
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ? AND cs.status = 'active'`,
    [req.clientId]
  );

  if (subscription && survey_cadence > subscription.survey_rounds_per_year) {
    return res.status(403).json({
      error: "Your plan only supports up to " + subscription.survey_rounds_per_year + " survey rounds per year. Please upgrade to increase cadence."
    });
  }

  // Update cadence
  await db.run(
    "UPDATE client_subscriptions SET survey_cadence = ? WHERE client_id = ?",
    [survey_cadence, req.clientId]
  );

  // Recalculate planned round dates based on the most recent concluded or in-progress round
  const intervalMonths = survey_cadence === 4 ? 3 : 6;
  const lastRound = await db.get(
    `SELECT launched_at, concluded_at FROM survey_rounds
     WHERE client_id = ? AND status IN ('in_progress', 'concluded') AND is_test = ?
     ORDER BY launched_at DESC LIMIT 1`,
    [req.clientId, req.isTestMode]
  );

  const plannedRounds = await db.all(
    `SELECT id, round_number FROM survey_rounds
     WHERE client_id = ? AND status = 'planned' AND is_test = ?
     ORDER BY round_number ASC`,
    [req.clientId, req.isTestMode]
  );

  // Count total rounds this year (all statuses)
  const allRounds = await db.all(
    "SELECT id, round_number, status FROM survey_rounds WHERE client_id = ? AND is_test = ? ORDER BY round_number ASC",
    [req.clientId, req.isTestMode]
  );

  // If increasing cadence and we need more planned rounds, create them
  if (survey_cadence > allRounds.length) {
    const maxRoundNum = allRounds.length > 0 ? Math.max(...allRounds.map(r => r.round_number)) : 0;
    const baseDate = lastRound ? new Date(lastRound.launched_at) : new Date();

    for (let i = allRounds.length; i < survey_cadence; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + intervalMonths * (i));
      const now = new Date();
      const finalDate = nextDate <= now
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 * (i - allRounds.length + 1))
        : nextDate;

      await db.run(
        "INSERT INTO survey_rounds (client_id, round_number, scheduled_date, status, is_test) VALUES (?, ?, ?, 'planned', ?)",
        [req.clientId, maxRoundNum + (i - allRounds.length + 1), finalDate.toISOString(), req.isTestMode]
      );
    }
  }

  // If decreasing cadence, remove excess planned rounds (only planned, never active/concluded)
  if (survey_cadence < allRounds.length) {
    const excessPlanned = await db.all(
      "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ? ORDER BY round_number DESC",
      [req.clientId, req.isTestMode]
    );
    const nonPlannedCount = allRounds.filter(r => r.status !== "planned").length;
    const targetPlanned = Math.max(0, survey_cadence - nonPlannedCount);
    const toRemove = excessPlanned.slice(0, excessPlanned.length - targetPlanned);
    for (const r of toRemove) {
      await db.run("DELETE FROM survey_rounds WHERE id = ? AND is_test = ?", [r.id, req.isTestMode]);
    }
  }

  // Re-fetch planned rounds after additions/removals
  const updatedPlanned = await db.all(
    `SELECT id, round_number FROM survey_rounds
     WHERE client_id = ? AND status = 'planned' AND is_test = ?
     ORDER BY round_number ASC`,
    [req.clientId, req.isTestMode]
  );

  let message = "";
  if (updatedPlanned.length > 0 && lastRound) {
    const baseDate = new Date(lastRound.launched_at);
    const now = new Date();
    let adjustedCount = 0;

    // Recalculate dates for all planned rounds relative to last launched round
    const nonPlannedCount = allRounds.filter(r => r.status !== "planned").length;
    for (let i = 0; i < updatedPlanned.length; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + intervalMonths * (nonPlannedCount + i));

      const finalDate = nextDate <= now
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 * (i + 1))
        : nextDate;

      if (nextDate <= now) adjustedCount++;

      await db.run(
        "UPDATE survey_rounds SET scheduled_date = ? WHERE id = ? AND is_test = ?",
        [finalDate.toISOString(), updatedPlanned[i].id, req.isTestMode]
      );
    }

    const nextPlanned = await db.get(
      "SELECT scheduled_date FROM survey_rounds WHERE client_id = ? AND status = 'planned' AND is_test = ? ORDER BY scheduled_date ASC LIMIT 1",
      [req.clientId, req.isTestMode]
    );

    const nextDateStr = nextPlanned
      ? new Date(nextPlanned.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    if (adjustedCount > 0) {
      message = `Cadence updated to ${survey_cadence}x/year. Your next round has been scheduled for ${nextDateStr} (30 days from today to give you time to prepare).`;
    } else {
      message = `Cadence updated to ${survey_cadence}x/year. Your next round is scheduled for ${nextDateStr}.`;
    }
  } else {
    message = `Cadence updated to ${survey_cadence}x/year.`;
  }

  res.json({ ok: true, message, survey_cadence });
});

// Get available plans for plan change UI
router.get("/account/subscription/plans", async (req, res) => {
  const plans = await db.all(
    "SELECT id, name, display_name, member_limit, survey_rounds_per_year, price_cents FROM subscription_plans WHERE is_public = TRUE ORDER BY sort_order"
  );
  res.json(plans);
});

// Change subscription plan (upgrade or downgrade via Zoho hosted page)
router.post("/account/subscription/change-plan", async (req, res) => {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({ error: "Plan ID is required" });
  }

  // Validate target plan
  const targetPlan = await db.get(
    "SELECT id, name, price_cents, zoho_plan_code, member_limit FROM subscription_plans WHERE id = ? AND is_public = TRUE",
    [plan_id]
  );
  if (!targetPlan) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  // Get current subscription
  const currentSub = await db.get(
    `SELECT cs.*, sp.name as plan_name, sp.price_cents as current_price_cents, sp.zoho_plan_code as current_zoho_code
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ?`,
    [req.clientId]
  );

  if (!currentSub) {
    return res.status(400).json({ error: "No active subscription found" });
  }

  if (currentSub.plan_id === plan_id) {
    return res.status(400).json({ error: "You are already on this plan" });
  }

  if (!isZohoConfigured()) {
    return res.status(502).json({ error: "Payment system is not configured. Please contact support." });
  }

  const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
  const isPaidTarget = targetPlan.price_cents && targetPlan.price_cents > 0;

  try {
    // Free → Paid: create new subscription checkout
    if (currentSub.plan_name === "free" && isPaidTarget) {
      const client = await db.get("SELECT * FROM clients WHERE id = ?", [req.clientId]);
      const admin = await db.get("SELECT email, first_name, last_name FROM client_admins WHERE client_id = ? LIMIT 1", [req.clientId]);

      const result = await createCheckoutSession({
        planCode: targetPlan.zoho_plan_code,
        customerInfo: {
          display_name: client.company_name,
          email: admin.email,
          first_name: admin.first_name || "",
          last_name: admin.last_name || "",
          phone: client.phone_number || "",
          company_name: client.company_name,
        },
        clientId: req.clientId,
        redirectUrl: `${baseUrl}/account/plan-changed`,
      });

      // Don't change plan or status yet — webhook will update after payment completes.
      // If user abandons checkout, their current free plan stays unchanged.
      return res.json({ checkout_url: result.url });
    }

    // Paid → Paid (upgrade or downgrade): update existing subscription
    if (currentSub.zoho_subscription_id && isPaidTarget) {
      const result = await updateSubscriptionHostedPage({
        zohoSubscriptionId: currentSub.zoho_subscription_id,
        newPlanCode: targetPlan.zoho_plan_code,
        redirectUrl: `${baseUrl}/account/plan-changed`,
      });

      return res.json({ checkout_url: result.url });
    }

    // Paid → Free: cancel Zoho subscription (downgrades at period end)
    if (currentSub.zoho_subscription_id && !isPaidTarget) {
      await cancelSubscription(currentSub.zoho_subscription_id);
      await db.run(
        "UPDATE client_subscriptions SET cancel_at_period_end = TRUE WHERE client_id = ?",
        [req.clientId]
      );

      await logActivity({
        actorType: "client_admin", actorId: req.userId, actorEmail: req.userEmail,
        action: "subscription_downgrade_to_free",
        entityType: "client", entityId: req.clientId, clientId: req.clientId,
      });

      return res.json({ ok: true, message: "Your subscription will downgrade to Free at the end of your billing period." });
    }

    return res.status(400).json({ error: "Unable to process plan change. Please contact support." });
  } catch (err) {
    logger.error({ err }, "Plan change error");
    return res.status(502).json({ error: "Payment system error. Please try again or contact support." });
  }
});

// Cancel subscription (at end of billing period)
router.post("/account/subscription/cancel", async (req, res) => {
  const sub = await db.get(
    `SELECT cs.zoho_subscription_id, cs.status, cs.cancel_at_period_end, sp.name as plan_name
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ?`,
    [req.clientId]
  );

  if (!sub) {
    return res.status(400).json({ error: "No subscription found" });
  }

  if (sub.plan_name === "free") {
    return res.status(400).json({ error: "Free plans cannot be cancelled" });
  }

  if (sub.cancel_at_period_end) {
    return res.status(400).json({ error: "Subscription is already scheduled for cancellation" });
  }

  if (!sub.zoho_subscription_id) {
    return res.status(400).json({ error: "No billing subscription found. Please contact support." });
  }

  try {
    await cancelSubscription(sub.zoho_subscription_id);

    await db.run(
      "UPDATE client_subscriptions SET cancel_at_period_end = TRUE WHERE client_id = ?",
      [req.clientId]
    );

    await logActivity({
      actorType: "client_admin", actorId: req.userId, actorEmail: req.userEmail,
      action: "subscription_cancel_scheduled",
      entityType: "client", entityId: req.clientId, clientId: req.clientId,
    });

    res.json({ ok: true, message: "Your subscription will be cancelled at the end of your billing period. You'll be downgraded to the Free plan." });
  } catch (err) {
    logger.error({ err }, "Cancel subscription error");
    res.status(502).json({ error: "Failed to cancel subscription. Please try again or contact support." });
  }
});

// Reactivate a subscription that was scheduled for cancellation
router.post("/account/subscription/reactivate", async (req, res) => {
  const sub = await db.get(
    "SELECT zoho_subscription_id, cancel_at_period_end FROM client_subscriptions WHERE client_id = ?",
    [req.clientId]
  );

  if (!sub || !sub.cancel_at_period_end) {
    return res.status(400).json({ error: "No pending cancellation to undo" });
  }

  if (!sub.zoho_subscription_id) {
    return res.status(400).json({ error: "No billing subscription found. Please contact support." });
  }

  try {
    await reactivateSubscription(sub.zoho_subscription_id);

    await db.run(
      "UPDATE client_subscriptions SET cancel_at_period_end = FALSE WHERE client_id = ?",
      [req.clientId]
    );

    await logActivity({
      actorType: "client_admin", actorId: req.userId, actorEmail: req.userEmail,
      action: "subscription_reactivated",
      entityType: "client", entityId: req.clientId, clientId: req.clientId,
    });

    res.json({ ok: true, message: "Your subscription has been reactivated." });
  } catch (err) {
    logger.error({ err }, "Reactivate subscription error");
    res.status(502).json({ error: "Failed to reactivate subscription. Please try again or contact support." });
  }
});

// Delete entire client account (requires password confirmation)
router.delete("/account", async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password is required to delete your account" });
  }

  // Verify password
  const admin = await db.get("SELECT password_hash FROM client_admins WHERE id = ? AND client_id = ?", [req.userId, req.clientId]);
  if (!admin) return res.status(404).json({ error: "Admin user not found" });

  const valid = await comparePassword(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect password" });

  // Log activity before deletion (activity_log uses ON DELETE SET NULL, so it persists)
  await logActivity({
    actorType: "client_admin",
    actorId: req.userId,
    actorEmail: req.userEmail,
    action: "delete_account",
    entityType: "client",
    entityId: req.clientId,
    clientId: req.clientId,
    metadata: { reason: "self_service_deletion" }
  });

  // Delete client — CASCADE rules handle cleanup of all child tables
  await db.run("DELETE FROM clients WHERE id = ?", [req.clientId]);

  // Destroy session
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Get board members (users table) for current client
router.get("/board-members", async (req, res) => {
  // Include most recent delivery status from any round
  const users = await db.all(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            COALESCE(c.community_name, u.community_name) as community_name,
            u.management_company, u.active, u.updated_at,
            il.delivery_status, il.email_status as invite_status
     FROM users u
     LEFT JOIN communities c ON c.id = u.community_id
     LEFT JOIN LATERAL (
       SELECT il2.delivery_status, il2.email_status
       FROM invitation_logs il2
       WHERE il2.user_id = u.id AND il2.client_id = $1 AND il2.is_test = $2
       ORDER BY il2.sent_at DESC LIMIT 1
     ) il ON TRUE
     WHERE u.client_id = $1 AND u.active = TRUE AND u.is_test = $2
     ORDER BY
       CASE WHEN il.delivery_status IN ('bounced', 'complained') THEN 0 ELSE 1 END,
       u.email`,
    [req.clientId, req.isTestMode]
  );
  res.json(users);
});

// Get inactive (deactivated) board members
router.get("/board-members/inactive", async (req, res) => {
  const users = await db.all(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            COALESCE(c.community_name, u.community_name) as community_name,
            u.management_company, u.updated_at
     FROM users u
     LEFT JOIN communities c ON c.id = u.community_id
     WHERE u.client_id = ? AND u.active = FALSE AND u.is_test = ?
     ORDER BY u.updated_at DESC`,
    [req.clientId, req.isTestMode]
  );
  res.json(users);
});

// Reactivate an inactive board member
router.post("/board-members/:id/reactivate", async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.get(
    "SELECT id, active FROM users WHERE id = ? AND client_id = ? AND is_test = ?",
    [id, req.clientId, req.isTestMode]
  );
  if (!user) return res.status(404).json({ error: "Member not found" });
  if (user.active) return res.status(400).json({ error: "Member is already active" });

  await db.run(
    "UPDATE users SET active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
    [id, req.isTestMode]
  );
  const updated = await db.get("SELECT * FROM users WHERE id = ?", [id]);
  res.json(updated);
});

// Export board members as CSV
router.get("/board-members/export", async (req, res) => {
  const users = await db.all(
    `SELECT u.first_name, u.last_name, u.email,
            COALESCE(c.community_name, u.community_name) as community_name,
            u.management_company
     FROM users u
     LEFT JOIN communities c ON c.id = u.community_id
     WHERE u.client_id = ? AND u.active = TRUE AND u.is_test = ?
     ORDER BY u.email`,
    [req.clientId, req.isTestMode]
  );

  const header = "first_name,last_name,email,community_name,management_company";
  const rows = users.map(u =>
    [u.first_name || "", u.last_name || "", u.email, u.community_name || "", u.management_company || ""]
      .map(v => `"${(v || "").replace(/"/g, '""')}"`)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=board-members.csv");
  res.send([header, ...rows].join("\n"));
});

// Bounce count for active round (lightweight, for tab badge)
router.get("/board-members/bounce-count", async (req, res) => {
  const result = await db.get(
    `SELECT COUNT(DISTINCT il.user_id) as bounce_count
     FROM invitation_logs il
     JOIN survey_rounds sr ON sr.id = il.round_id AND sr.status = 'in_progress' AND sr.client_id = $1 AND sr.is_test = $2
     WHERE il.client_id = $1 AND il.delivery_status IN ('bounced', 'complained') AND il.is_test = $2
     AND il.sent_at = (
       SELECT MAX(il2.sent_at) FROM invitation_logs il2
       WHERE il2.user_id = il.user_id AND il2.round_id = il.round_id
     )`,
    [req.clientId, req.isTestMode]
  );
  res.json({ bounce_count: parseInt(result?.bounce_count) || 0 });
});

// Add board member
router.post("/board-members", async (req, res) => {
  const { email, first_name, last_name, community_name, management_company } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if email already exists for this client
  // Check if email exists (including inactive — reactivate if so)
  const existing = await db.get("SELECT id, active FROM users WHERE email = ? AND client_id = ? AND is_test = ?", [cleanEmail, req.clientId, req.isTestMode]);
  if (existing && existing.active) {
    return res.status(400).json({ error: "A board member with this email already exists" });
  }

  if (existing && !existing.active) {
    // Reactivate previously removed board member
    const canonicalCommunity = await autoCreateCommunityIfNeeded(req.clientId, community_name, req.isTestMode);
    await db.run(
      "UPDATE users SET active = TRUE, first_name = ?, last_name = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
      [first_name || null, last_name || null, canonicalCommunity || community_name || null, management_company || null, existing.id, req.isTestMode]
    );
    await autoLinkUsersToCommunities(req.clientId, req.isTestMode);
    const reactivated = await db.get("SELECT * FROM users WHERE id = ?", [existing.id]);
    return res.json(reactivated);
  }

  const canonicalCommunity = await autoCreateCommunityIfNeeded(req.clientId, community_name, req.isTestMode);
  const result = await db.run(
    "INSERT INTO users (client_id, email, first_name, last_name, community_name, management_company, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [req.clientId, cleanEmail, first_name || null, last_name || null, canonicalCommunity || community_name || null, management_company || null, req.isTestMode]
  );

  await autoLinkUsersToCommunities(req.clientId, req.isTestMode);
  const newUser = await db.get("SELECT * FROM users WHERE id = ?", [result.lastInsertRowid]);
  res.json(newUser);
});

// Update board member
router.put("/board-members/:id", async (req, res) => {
  const { id } = req.params;
  const { email, first_name, last_name, community_name, management_company } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Verify the user belongs to this client
  const user = await db.get("SELECT id FROM users WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!user) {
    return res.status(404).json({ error: "Board member not found" });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if email is already used by another user
  const existing = await db.get("SELECT id FROM users WHERE email = ? AND client_id = ? AND id != ? AND is_test = ?", [cleanEmail, req.clientId, id, req.isTestMode]);
  if (existing) {
    return res.status(400).json({ error: "A board member with this email already exists" });
  }

  const canonicalCommunity = await autoCreateCommunityIfNeeded(req.clientId, community_name, req.isTestMode);
  await db.run(
    "UPDATE users SET email = ?, first_name = ?, last_name = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP, community_id = NULL WHERE id = ? AND is_test = ?",
    [cleanEmail, first_name || null, last_name || null, canonicalCommunity || community_name || null, management_company || null, id, req.isTestMode]
  );

  await autoLinkUsersToCommunities(req.clientId, req.isTestMode);

  const updatedUser = await db.get("SELECT * FROM users WHERE id = ?", [id]);
  res.json(updatedUser);
});

// Deactivate board member (soft-delete — preserves historical survey data)
router.delete("/board-members/:id", async (req, res) => {
  const { id } = req.params;

  // Verify the user belongs to this client
  const user = await db.get("SELECT id FROM users WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!user) {
    return res.status(404).json({ error: "Board member not found" });
  }

  await db.run("UPDATE users SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?", [id, req.isTestMode]);
  res.json({ ok: true });
});

// Import board members from CSV
router.post("/board-members/import", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;
    const csv = file.data.toString("utf8");
    const lines = csv.split("\n").map((l) => l.trim()).filter((l) => l);

    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV file is empty or invalid" });
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const emailIndex = headers.indexOf("email");

    if (emailIndex === -1) {
      return res.status(400).json({ error: "CSV must contain an 'email' column" });
    }

    const firstNameIndex = headers.indexOf("first_name");
    const lastNameIndex = headers.indexOf("last_name");
    const communityIndex = headers.indexOf("community_name");
    const companyIndex = headers.indexOf("management_company");

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const email = values[emailIndex]?.toLowerCase();

      if (!email || !email.includes("@")) {
        errors.push(`Row ${i + 1}: Invalid email`);
        continue;
      }

      const first_name = firstNameIndex >= 0 ? values[firstNameIndex] || null : null;
      const last_name = lastNameIndex >= 0 ? values[lastNameIndex] || null : null;
      const community_name = communityIndex >= 0 ? values[communityIndex] || null : null;
      const management_company = companyIndex >= 0 ? values[companyIndex] || null : null;

      try {
        // Fuzzy-match community name to prevent duplicates
        const canonicalCommunity = await autoCreateCommunityIfNeeded(req.clientId, community_name, req.isTestMode);
        const finalCommunity = canonicalCommunity || community_name;

        const existing = await db.get("SELECT id, active FROM users WHERE email = ? AND client_id = ? AND is_test = ?", [email, req.clientId, req.isTestMode]);

        if (existing) {
          await db.run(
            "UPDATE users SET first_name = ?, last_name = ?, community_name = ?, management_company = ?, active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
            [first_name, last_name, finalCommunity, management_company, existing.id, req.isTestMode]
          );
          updated++;
        } else {
          await db.run(
            "INSERT INTO users (client_id, email, first_name, last_name, community_name, management_company, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [req.clientId, email, first_name, last_name, finalCommunity, management_company, req.isTestMode]
          );
          created++;
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    // Auto-link imported members to communities if they exist
    await autoLinkUsersToCommunities(req.clientId, req.isTestMode);

    res.json({
      created,
      updated,
      total: created + updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to add delay between email sends (rate limiting)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Send survey invitations to selected board members
router.post("/board-members/invite", async (req, res) => {
  try {
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: "user_ids array is required" });
    }

    // Check survey round limit (enforce against client's chosen cadence)
    const subscription = await db.get(
      `SELECT cs.survey_cadence, sp.survey_rounds_per_year
       FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ? AND cs.status = 'active'`,
      [req.clientId]
    );

    if (subscription) {
      const limit = subscription.survey_cadence || subscription.survey_rounds_per_year;
      const currentYear = new Date().getFullYear();
      const roundsUsed = await db.get(
        `SELECT COUNT(DISTINCT DATE(sent_at)) as count
         FROM invitation_logs
         WHERE client_id = ? AND email_status = 'sent'
         AND EXTRACT(YEAR FROM sent_at) = ? AND is_test = ?`,
        [req.clientId, currentYear, req.isTestMode]
      );

      const todayStr = new Date().toISOString().split("T")[0];
      const todayCounted = await db.get(
        `SELECT COUNT(*) as count FROM invitation_logs
         WHERE client_id = ? AND email_status = 'sent' AND DATE(sent_at) = ? AND is_test = ?`,
        [req.clientId, todayStr, req.isTestMode]
      );

      const effectiveRounds = (roundsUsed?.count || 0) + (todayCounted?.count > 0 ? 0 : 1);

      if (effectiveRounds > limit) {
        return res.status(403).json({
          error: `Survey round limit reached (${limit} rounds/year). ${limit < subscription.survey_rounds_per_year ? "You can increase your cadence in Account settings." : "Please upgrade your plan."}`
        });
      }
    }

    // Calculate token expiry
    const expiryHours = parseInt(process.env.INVITATION_TOKEN_EXPIRY_HOURS) || 48;
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + expiryHours);

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const userId of user_ids) {
      try {
        // Verify user belongs to this client
        const user = await db.get(
          "SELECT id, email, first_name, last_name, community_name, management_company FROM users WHERE id = ? AND client_id = ? AND is_test = ?",
          [userId, req.clientId, req.isTestMode]
        );

        if (!user) {
          results.push({
            user_id: userId,
            status: "failed",
            error: "User not found or does not belong to this client"
          });
          failedCount++;
          continue;
        }

        // Generate unique invitation token
        const token = crypto.randomUUID();

        // Update user with token and expiry
        await db.run(
          "UPDATE users SET invitation_token = ?, invitation_token_expires = ?, last_invited_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
          [token, expiryDate.toISOString(), userId, req.isTestMode]
        );

        // Send email via Resend
        const emailResult = await sendInvitation(user, token, { clientId: req.clientId });

        // Log invitation with Resend email ID
        await db.run(
          "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, resend_email_id, is_test) VALUES (?, ?, ?, ?, ?, ?)",
          [userId, req.clientId, req.userId, "sent", emailResult?.id || null, req.isTestMode]
        );

        results.push({
          user_id: userId,
          email: user.email,
          status: "sent"
        });
        sentCount++;

      } catch (err) {
        logger.error({ err }, `Failed to send invitation to user ${userId}`);

        // Log failed invitation
        try {
          await db.run(
            "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, error_message, is_test) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, req.clientId, req.userId, "failed", err.message, req.isTestMode]
          );
        } catch (logErr) {
          logger.error({ err: logErr }, "Failed to log invitation error");
        }

        results.push({
          user_id: userId,
          status: "failed",
          error: err.message
        });
        failedCount++;
      }

      // Add 500ms delay between emails to respect Resend's 2 requests/second rate limit
      // (skip delay after last email)
      if (userId !== user_ids[user_ids.length - 1]) {
        await sleep(500);
      }
    }

    res.json({
      sent: sentCount,
      failed: failedCount,
      results
    });

  } catch (err) {
    logger.error({ err }, "Invitation endpoint error");
    res.status(500).json({ error: err.message });
  }
});

// Generate a survey link for a test member (test mode only)
router.post("/board-members/:id/survey-link", async (req, res) => {
  if (!req.isTestMode) {
    return res.status(403).json({ error: "Survey links can only be generated in test mode" });
  }

  const userId = Number(req.params.id);
  const user = await db.get(
    "SELECT id, email, first_name FROM users WHERE id = ? AND client_id = ? AND is_test = TRUE AND active = TRUE",
    [userId, req.clientId]
  );
  if (!user) {
    return res.status(404).json({ error: "Test member not found" });
  }

  // Find active test round
  const round = await db.get(
    "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'in_progress' AND is_test = TRUE ORDER BY launched_at DESC LIMIT 1",
    [req.clientId]
  );
  if (!round) {
    return res.status(400).json({ error: "No active test round. Switch to test mode to create one." });
  }

  // Generate token (long expiry for test mode — 30 days)
  const token = crypto.randomUUID();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  await db.run(
    "UPDATE users SET invitation_token = ?, invitation_token_expires = ?, last_invited_at = CURRENT_TIMESTAMP WHERE id = ?",
    [token, expiryDate.toISOString(), userId]
  );

  // Log as simulated invitation
  await db.run(
    "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, is_test) VALUES (?, ?, ?, 'simulated', TRUE)",
    [userId, req.clientId, req.userId]
  );

  const baseUrl = process.env.SURVEY_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const surveyUrl = `${baseUrl}/survey?token=${token}`;

  res.json({ url: surveyUrl, token, member: user.first_name || user.email });
});

// Get admin users for current client
router.get("/users", async (req, res) => {
  const users = await db.all(
    "SELECT id, email, first_name, last_name, created_at FROM client_admins WHERE client_id = ? ORDER BY created_at",
    [req.clientId]
  );
  res.json(users);
});

// Add admin user to current client
router.post("/users", async (req, res) => {
  const { email, first_name, last_name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if email already exists
  const existing = await db.get("SELECT id FROM client_admins WHERE email = ?", [cleanEmail]);
  if (existing) {
    return res.status(400).json({ error: "An admin with this email already exists" });
  }

  // Generate temporary password
  const tempPassword = generatePassword(16);
  const passwordHash = await hashPassword(tempPassword);

  // Get company name for email
  const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [req.clientId]);

  // Create admin user
  await db.run(
    "INSERT INTO client_admins (client_id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)",
    [req.clientId, cleanEmail, passwordHash, first_name || null, last_name || null]
  );

  // Send credentials email to new admin
  try {
    await sendNewAdminEmail(cleanEmail, tempPassword, {
      firstName: first_name || null,
      companyName: client?.company_name || "your company",
    });
  } catch (emailErr) {
    logger.error({ err: emailErr }, "Failed to send new admin email");
    // Still return success — admin was created, just email failed
  }

  res.json({
    ok: true,
    email: cleanEmail,
    message: "Admin user created. Login credentials have been sent to their email."
  });
});

// Update admin user name
router.patch("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name } = req.body;

  const user = await db.get("SELECT id FROM client_admins WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!user) {
    return res.status(404).json({ error: "Admin user not found" });
  }

  await db.run(
    "UPDATE client_admins SET first_name = ?, last_name = ? WHERE id = ?",
    [first_name || null, last_name || null, id]
  );

  res.json({ ok: true });
});

// Remove admin user from current client
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  // Verify the user belongs to this client
  const user = await db.get("SELECT id FROM client_admins WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!user) {
    return res.status(404).json({ error: "Admin user not found" });
  }

  // Prevent removing yourself
  if (Number(id) === req.userId) {
    return res.status(400).json({ error: "You cannot remove yourself" });
  }

  // Check if this is the last admin for this client
  const adminCount = await db.get("SELECT COUNT(*) as count FROM client_admins WHERE client_id = ?", [req.clientId]);
  if (adminCount.count <= 1) {
    return res.status(400).json({ error: "Cannot remove the last admin user" });
  }

  await db.run("DELETE FROM client_admins WHERE id = ?", [id]);
  res.json({ ok: true });
});

// --- Critical Alerts ---

// Get undismissed alerts for this client
router.get("/alerts", async (req, res) => {
  try {
    const alerts = await db.all(
      `SELECT ca.*,
              u.first_name, u.last_name, u.email as user_email,
              COALESCE(cm.community_name, u.community_name) as community_name,
              sr.round_number
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       LEFT JOIN communities cm ON cm.id = u.community_id
       LEFT JOIN survey_rounds sr ON sr.id = ca.round_id
       WHERE ca.client_id = ? AND ca.dismissed = FALSE AND ca.is_test = ?
       ORDER BY ca.created_at DESC`,
      [req.clientId, req.isTestMode]
    );
    res.json(alerts);
  } catch (err) {
    logger.error({ err }, "Error fetching alerts");
    res.status(500).json({ error: err.message });
  }
});

// Get alerts for a specific round (including dismissed)
router.get("/alerts/round/:roundId", async (req, res) => {
  try {
    const roundId = Number(req.params.roundId);

    // Verify round belongs to client
    const round = await db.get(
      "SELECT id FROM survey_rounds WHERE id = ? AND client_id = ? AND is_test = ?",
      [roundId, req.clientId, req.isTestMode]
    );
    if (!round) return res.status(404).json({ error: "Round not found" });

    const alerts = await db.all(
      `SELECT ca.*,
              u.first_name, u.last_name, u.email as user_email,
              COALESCE(cm.community_name, u.community_name) as community_name
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       LEFT JOIN communities cm ON cm.id = u.community_id
       WHERE ca.round_id = ? AND ca.client_id = ? AND ca.is_test = ?
       ORDER BY ca.created_at DESC`,
      [roundId, req.clientId, req.isTestMode]
    );
    res.json(alerts);
  } catch (err) {
    logger.error({ err }, "Error fetching round alerts");
    res.status(500).json({ error: err.message });
  }
});

// Dismiss an alert
router.post("/alerts/:id/dismiss", async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    const { reason } = req.body;

    const alert = await db.get(
      "SELECT id FROM critical_alerts WHERE id = ? AND client_id = ? AND is_test = ?",
      [alertId, req.clientId, req.isTestMode]
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await db.run(
      "UPDATE critical_alerts SET dismissed = TRUE, dismissed_by = ?, dismissed_at = CURRENT_TIMESTAMP, dismiss_reason = ? WHERE id = ? AND is_test = ?",
      [req.userId, reason || null, alertId, req.isTestMode]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "dismiss_alert",
      entityType: "critical_alert",
      entityId: alertId,
      clientId: req.clientId,
      metadata: { reason: reason || null }
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error dismissing alert");
    res.status(500).json({ error: err.message });
  }
});

// Mark an alert as solved
router.post("/alerts/:id/solve", async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    const { note } = req.body;

    const alert = await db.get(
      "SELECT id FROM critical_alerts WHERE id = ? AND client_id = ? AND is_test = ?",
      [alertId, req.clientId, req.isTestMode]
    );
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    await db.run(
      "UPDATE critical_alerts SET solved = TRUE, solved_by = ?, solved_at = CURRENT_TIMESTAMP, solve_note = ? WHERE id = ? AND is_test = ?",
      [req.userId, note || null, alertId, req.isTestMode]
    );

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "solve_alert",
      entityType: "critical_alert",
      entityId: alertId,
      clientId: req.clientId,
      metadata: { note: note || null }
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error solving alert");
    res.status(500).json({ error: err.message });
  }
});

// --- Session Finalization ---

// Finalize an incomplete session (generate summary + mark complete)
router.post("/sessions/:id/finalize", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const session = await db.get(
      "SELECT * FROM sessions WHERE id = ? AND client_id = ? AND is_test = ?",
      [sessionId, req.clientId, req.isTestMode]
    );
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.completed) {
      return res.status(400).json({ error: "Session is already completed" });
    }

    // Check it has enough data to finalize
    const messageCount = await db.get(
      "SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role = 'user'",
      [sessionId]
    );
    if (!messageCount || messageCount.count < 2) {
      return res.status(400).json({ error: "Session does not have enough conversation data to finalize" });
    }

    // Mark complete
    await db.run("UPDATE sessions SET completed = TRUE WHERE id = ? AND is_test = ?", [sessionId, req.isTestMode]);

    // Generate summary synchronously so admin sees the result
    const summary = await generateSummary(sessionId);

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "finalize_session",
      entityType: "session",
      entityId: sessionId,
      clientId: req.clientId,
    });

    res.json({ ok: true, summary });
  } catch (err) {
    logger.error({ err }, "Error finalizing session");
    res.status(500).json({ error: err.message });
  }
});

// ============ Community Endpoints (Paid Tiers) ============

// Helper: check if client is on a paid tier
async function requirePaidTier(req, res) {
  const sub = await db.get(
    `SELECT sp.name as plan_name FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ? AND cs.status = 'active'`,
    [req.clientId]
  );
  if (!sub || sub.plan_name === "free") {
    res.status(403).json({ error: "Community data import requires a paid plan. Please upgrade to access this feature." });
    return false;
  }
  return true;
}

// Helper: Levenshtein distance for fuzzy name matching
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Helper: auto-create community if community_name doesn't exist for this client.
// Uses fuzzy matching to prevent near-duplicate communities (e.g. "Oak Ridge" vs "Oak Ridge HOA").
// If a close match is found, normalizes the user's community_name to the existing one.
// Returns the canonical community_name (existing match or the new one).
async function autoCreateCommunityIfNeeded(clientId, communityName, isTestMode = false) {
  if (!communityName || !communityName.trim()) return null;
  const trimmed = communityName.trim();
  const normalized = trimmed.toLowerCase();

  // Exact match check first
  const exact = await db.get(
    "SELECT id, community_name FROM communities WHERE client_id = ? AND LOWER(TRIM(community_name)) = LOWER(?) AND is_test = ?",
    [clientId, trimmed, isTestMode]
  );
  if (exact) return exact.community_name;

  // Fuzzy match: check all communities for this client
  const allCommunities = await db.all(
    "SELECT id, community_name FROM communities WHERE client_id = ? AND is_test = ?",
    [clientId, isTestMode]
  );

  for (const c of allCommunities) {
    const existingNorm = c.community_name.toLowerCase().trim();
    const dist = levenshtein(normalized, existingNorm);
    const maxLen = Math.max(normalized.length, existingNorm.length);
    // Match if: Levenshtein ≤ 2, OR one is a substring of the other (for "Oak Ridge" vs "Oak Ridge HOA")
    if (dist <= 2 || existingNorm.includes(normalized) || normalized.includes(existingNorm)) {
      return c.community_name; // Use existing name as canonical
    }
  }

  // No match found — create new community
  await db.run(
    "INSERT INTO communities (client_id, community_name, is_test) VALUES (?, ?, ?)",
    [clientId, trimmed, isTestMode]
  );
  return trimmed;
}

// Helper: auto-link users to communities by normalized name
async function autoLinkUsersToCommunities(clientId, isTestMode = false) {
  const result = await db.pool.query(
    `UPDATE users u SET community_id = c.id
     FROM communities c
     WHERE u.client_id = c.client_id
       AND u.client_id = $1
       AND LOWER(TRIM(u.community_name)) = LOWER(TRIM(c.community_name))
       AND u.community_id IS NULL
       AND u.is_test = $2
       AND c.is_test = $2`,
    [clientId, isTestMode]
  );
  return result.rowCount || 0;
}

// Helper: parse CSV rows (reused for import and preview)
function parseCommunityCSV(csv) {
  const lines = csv.split("\n").map((l) => l.trim()).filter((l) => l);
  if (lines.length < 2) return { error: "CSV file is empty or invalid", rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const nameIdx = headers.indexOf("community_name");
  if (nameIdx === -1) return { error: "CSV must contain a 'community_name' column", rows: [] };

  const contractIdx = headers.indexOf("contract_value");
  const managerIdx = headers.indexOf("community_manager_name");
  const typeIdx = headers.indexOf("property_type");
  const unitsIdx = headers.indexOf("number_of_units");

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const name = values[nameIdx];
    if (!name) {
      errors.push(`Row ${i + 1}: Missing community_name`);
      continue;
    }
    rows.push({
      community_name: name,
      contract_value: contractIdx >= 0 ? parseFloat(values[contractIdx]) || null : null,
      community_manager_name: managerIdx >= 0 ? values[managerIdx] || null : null,
      property_type: typeIdx >= 0 ? values[typeIdx]?.toLowerCase().replace(/\s+/g, "_") || null : null,
      number_of_units: unitsIdx >= 0 ? parseInt(values[unitsIdx]) || null : null,
    });
  }
  return { rows, errors };
}

// Get all communities for this client
router.get("/communities", async (req, res) => {
  let communities = await db.all(
    `SELECT c.*, COUNT(u.id) as member_count
     FROM communities c
     LEFT JOIN users u ON u.community_id = c.id AND u.active = TRUE
     WHERE c.client_id = ? AND c.is_test = ?
     GROUP BY c.id
     ORDER BY c.status ASC, c.community_name`,
    [req.clientId, req.isTestMode]
  );

  // Auto-seed: if no communities exist, create them from board member community_name values
  if (communities.length === 0) {
    try {
      const distinctNames = await db.all(
        `SELECT DISTINCT community_name FROM users
         WHERE client_id = ? AND community_name IS NOT NULL AND TRIM(community_name) != '' AND active = TRUE AND is_test = ?`,
        [req.clientId, req.isTestMode]
      );

      for (const row of distinctNames) {
        await db.run(
          "INSERT INTO communities (client_id, community_name, is_test) VALUES (?, ?, ?)",
          [req.clientId, row.community_name.trim(), req.isTestMode]
        );
      }

      if (distinctNames.length > 0) {
        await autoLinkUsersToCommunities(req.clientId, req.isTestMode);

        // Re-fetch with member counts
        communities = await db.all(
          `SELECT c.*, COUNT(u.id) as member_count
           FROM communities c
           LEFT JOIN users u ON u.community_id = c.id AND u.active = TRUE
           WHERE c.client_id = ? AND c.is_test = ?
           GROUP BY c.id
           ORDER BY c.status ASC, c.community_name`,
          [req.clientId, req.isTestMode]
        );
      }
    } catch (err) {
      logger.error({ err }, "Auto-seed communities failed");
    }
  }

  res.json(communities);
});

// Export communities as CSV
router.get("/communities/export", async (req, res) => {
  const communities = await db.all(
    `SELECT c.community_name, c.contract_value, c.community_manager_name,
            c.property_type, c.number_of_units, c.contract_renewal_date,
            c.contract_month_to_month, c.status, COUNT(u.id) as member_count
     FROM communities c
     LEFT JOIN users u ON u.community_id = c.id AND u.active = TRUE
     WHERE c.client_id = ? AND c.is_test = ?
     GROUP BY c.id
     ORDER BY c.status ASC, c.community_name`,
    [req.clientId, req.isTestMode]
  );

  const escCSV = (val) => {
    if (val == null) return "";
    const s = String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = "community_name,contract_value,community_manager_name,property_type,number_of_units,contract_renewal_date,month_to_month,status,member_count";
  const rows = communities.map(c =>
    [c.community_name, c.contract_value || "", c.community_manager_name || "",
     c.property_type || "", c.number_of_units || "", c.contract_renewal_date ? c.contract_renewal_date.split("T")[0] : "",
     c.contract_month_to_month ? "yes" : "no", c.status || "active", c.member_count || 0
    ].map(escCSV).join(",")
  );

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="communities-export.csv"`);
  res.send(csv);
});

// Create a single community
router.post("/communities", async (req, res) => {
  try {
    if (!(await requirePaidTier(req, res))) return;

    const { community_name, contract_value, community_manager_name, property_type, number_of_units, contract_renewal_date, contract_month_to_month } = req.body;
    if (!community_name?.trim()) return res.status(400).json({ error: "Community name is required" });

    const validTypes = ["condo", "townhome", "single_family", "mixed", "other"];
    const propType = validTypes.includes(property_type) ? property_type : null;

    const existing = await db.get(
      "SELECT id, community_name FROM communities WHERE LOWER(TRIM(community_name)) = ? AND client_id = ? AND is_test = ?",
      [community_name.toLowerCase().trim(), req.clientId, req.isTestMode]
    );
    if (existing) return res.status(400).json({ error: "A community with that name already exists" });

    // Fuzzy check: warn if a similar community exists
    const allCommunities = await db.all(
      "SELECT community_name FROM communities WHERE client_id = ? AND is_test = ?", [req.clientId, req.isTestMode]
    );
    const normalized = community_name.toLowerCase().trim();
    for (const c of allCommunities) {
      const existingNorm = c.community_name.toLowerCase().trim();
      const dist = levenshtein(normalized, existingNorm);
      if (dist <= 2 || existingNorm.includes(normalized) || normalized.includes(existingNorm)) {
        return res.status(400).json({ error: `A similar community already exists: "${c.community_name}". Did you mean to update that one instead?` });
      }
    }

    await db.run(
      `INSERT INTO communities (client_id, community_name, contract_value, community_manager_name, property_type, number_of_units, contract_renewal_date, contract_month_to_month, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.clientId, community_name.trim(), contract_value || null, community_manager_name || null, propType, number_of_units || null, contract_renewal_date || null, contract_month_to_month || false, req.isTestMode]
    );

    const created = await db.get(
      "SELECT * FROM communities WHERE client_id = ? AND LOWER(TRIM(community_name)) = ? AND is_test = ?",
      [req.clientId, community_name.toLowerCase().trim(), req.isTestMode]
    );

    // Auto-link any board members with matching community name
    await autoLinkUsersToCommunities(req.clientId, req.isTestMode);

    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview community CSV import (no save)
router.post("/communities/import/preview", async (req, res) => {
  try {
    if (!(await requirePaidTier(req, res))) return;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const csv = req.files.file.data.toString("utf8");
    const { rows, errors, error } = parseCommunityCSV(csv);
    if (error) return res.status(400).json({ error });

    // Get existing community names from board members
    const existingNames = await db.all(
      "SELECT DISTINCT community_name FROM users WHERE client_id = ? AND community_name IS NOT NULL AND active = TRUE AND is_test = ?",
      [req.clientId, req.isTestMode]
    );
    const nameList = existingNames.map((r) => r.community_name);

    // Get member counts per community name
    const memberCounts = await db.all(
      "SELECT community_name, COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE AND community_name IS NOT NULL AND is_test = ? GROUP BY community_name",
      [req.clientId, req.isTestMode]
    );
    const countMap = Object.fromEntries(memberCounts.map((r) => [r.community_name.toLowerCase().trim(), r.count]));

    const matched = [];
    const unmatched = [];

    for (const row of rows) {
      const normalized = row.community_name.toLowerCase().trim();
      const exactMatch = nameList.find((n) => n.toLowerCase().trim() === normalized);

      if (exactMatch) {
        matched.push({
          ...row,
          matched_name: exactMatch,
          member_count: countMap[normalized] || 0,
        });
      } else {
        // Find close matches via Levenshtein
        const suggestions = nameList
          .map((n) => ({ name: n, distance: levenshtein(normalized, n.toLowerCase().trim()) }))
          .filter((s) => s.distance <= 3 || normalized.includes(s.name.toLowerCase().trim()) || s.name.toLowerCase().trim().includes(normalized))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3)
          .map((s) => ({
            name: s.name,
            member_count: countMap[s.name.toLowerCase().trim()] || 0,
          }));

        unmatched.push({
          ...row,
          suggestions,
        });
      }
    }

    res.json({ matched, unmatched, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import communities from CSV
router.post("/communities/import", async (req, res) => {
  try {
    if (!(await requirePaidTier(req, res))) return;

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const csv = req.files.file.data.toString("utf8");
    const { rows, errors, error } = parseCommunityCSV(csv);
    if (error) return res.status(400).json({ error });

    // Optional: name remapping from preview (e.g., "Oak Ridge" → "Oak Ridge HOA")
    const nameMap = req.body.name_map ? JSON.parse(req.body.name_map) : {};

    let created = 0;
    let updated = 0;

    const validTypes = ["condo", "townhome", "single_family", "mixed", "other"];

    for (const row of rows) {
      let finalName = nameMap[row.community_name] || row.community_name;
      const propType = validTypes.includes(row.property_type) ? row.property_type : null;

      try {
        // Exact match first
        let existing = await db.get(
          "SELECT id, community_name FROM communities WHERE LOWER(TRIM(community_name)) = ? AND client_id = ? AND is_test = ?",
          [finalName.toLowerCase().trim(), req.clientId, req.isTestMode]
        );

        // Fuzzy match if no exact match and no explicit remap from preview
        if (!existing && !nameMap[row.community_name]) {
          const allCommunities = await db.all(
            "SELECT id, community_name FROM communities WHERE client_id = ? AND is_test = ?", [req.clientId, req.isTestMode]
          );
          const normalized = finalName.toLowerCase().trim();
          for (const c of allCommunities) {
            const existingNorm = c.community_name.toLowerCase().trim();
            const dist = levenshtein(normalized, existingNorm);
            if (dist <= 2 || existingNorm.includes(normalized) || normalized.includes(existingNorm)) {
              existing = c;
              finalName = c.community_name;
              break;
            }
          }
        }

        if (existing) {
          await db.run(
            `UPDATE communities SET contract_value = ?, community_manager_name = ?, property_type = ?, number_of_units = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?`,
            [row.contract_value, row.community_manager_name, propType, row.number_of_units, existing.id, req.isTestMode]
          );
          updated++;
        } else {
          await db.run(
            `INSERT INTO communities (client_id, community_name, contract_value, community_manager_name, property_type, number_of_units, is_test)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.clientId, finalName, row.contract_value, row.community_manager_name, propType, row.number_of_units, req.isTestMode]
          );
          created++;
        }
      } catch (err) {
        errors.push(`${finalName}: ${err.message}`);
      }
    }

    // Auto-link board members to communities
    const linked = await autoLinkUsersToCommunities(req.clientId, req.isTestMode);

    res.json({ created, updated, matched_members: linked, total: created + updated, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a community
router.put("/communities/:id", async (req, res) => {
  const { id } = req.params;
  const community = await db.get("SELECT id FROM communities WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!community) return res.status(404).json({ error: "Community not found" });

  const { community_name, contract_value, community_manager_name, property_type, number_of_units, contract_renewal_date, contract_month_to_month } = req.body;
  const validTypes = ["condo", "townhome", "single_family", "mixed", "other"];
  const propType = validTypes.includes(property_type) ? property_type : null;

  await db.run(
    `UPDATE communities SET community_name = ?, contract_value = ?, community_manager_name = ?, property_type = ?, number_of_units = ?, contract_renewal_date = ?, contract_month_to_month = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?`,
    [community_name, contract_value || null, community_manager_name || null, propType, number_of_units || null, contract_renewal_date || null, contract_month_to_month || false, id, req.isTestMode]
  );

  const updated = await db.get("SELECT * FROM communities WHERE id = ?", [id]);
  res.json(updated);
});

// Deactivate/reactivate a community (toggle)
router.delete("/communities/:id", async (req, res) => {
  const { id } = req.params;
  const community = await db.get("SELECT id, status FROM communities WHERE id = ? AND client_id = ? AND is_test = ?", [id, req.clientId, req.isTestMode]);
  if (!community) return res.status(404).json({ error: "Community not found" });

  if (community.status === "deactivated") {
    await db.run(
      "UPDATE communities SET status = 'active', deactivated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
      [id, req.isTestMode]
    );
    res.json({ ok: true, status: "active" });
  } else {
    await db.run(
      "UPDATE communities SET status = 'deactivated', deactivated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_test = ?",
      [id, req.isTestMode]
    );
    res.json({ ok: true, status: "deactivated" });
  }
});

// --- Help Chatbot ---

import { createMessage } from "../utils/anthropicClient.js";

router.post("/help-chat", async (req, res) => {
  try {
    const { question, history } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    // Build conversation history for multi-turn
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) { // Keep last 6 messages for context
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: question.trim() });

    const response = await createMessage({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `You are a helpful support assistant for ResidentPulse, a platform that helps property management companies collect NPS feedback from HOA and condo board members through AI-guided conversations.

Answer questions using ONLY the knowledge base below. Be concise and friendly. If you don't know the answer from the knowledge base, say so honestly and suggest they contact support.

KNOWLEDGE BASE:
- ResidentPulse sends personal email invitations to board members with unique links — no login needed.
- Each board member rates the management company 0-10 (NPS score), then has a short AI-guided conversation.
- NPS = % Promoters (9-10) minus % Detractors (0-6). Passives are 7-8. Range: -100 to +100.
- Survey rounds last 30 days. Stages: Planned → In Progress → Concluded.
- Automatic reminders go out on Day 10 and Day 20 to non-responders.
- Cadence options: 2x/year (every 6 months) or 4x/year (every 3 months, paid plans).
- Communities are auto-created from board member data. Paid plans get community details (contract value, manager, units).
- Critical Alerts flag urgent issues (safety, legal, service failures) during conversations. Can be dismissed or resolved.
- Google Review requests: enabled in Account settings. Promoters (9-10) are asked to leave a Google review. Requires a Google Business review URL.
- Detractor Alert emails: configurable threshold in Account settings. Emails go to all client admins when a score falls below threshold.
- Members tab: add/edit/remove board members, export CSV, import CSV, reactivate inactive members.
- Member CSV import: click Import on Members tab. Required columns: email, first_name, last_name, community_name. Optional: management_company. Download the sample CSV template for the correct format. Duplicates are auto-skipped.
- Community CSV import: click Import on Communities tab. Columns: community_name (must match existing), contract_value, community_manager_name, property_type (condo/single_family/townhouse/mixed/other), number_of_units. Shows a preview before confirming. Download the sample CSV template for the correct format. Importing community data unlocks Revenue at Risk, Manager Performance heatmap, and contract renewal tracking.
- Bounced emails show a red badge on the Members page. Correcting the email auto-resends the invitation.
- Company logo can be uploaded in Account settings (PNG/JPG/SVG, max 500KB, landscape/square, max 3:1 ratio).
- Account setup: 1) Company interview, 2) Add board members, 3) Schedule first round.
- Confirm & Launch button appears when a round is within 30 days of its launch date.
- Invitations send in the background with a progress bar. Members get unique links.
- Board member feedback is private — admins see NPS scores, AI summaries, and alerts, not transcripts.
- AI Insights (executive summary, key findings, recommendations) appear after a round concludes.
- Trends tab shows NPS over time, response rates, community cohorts, and trending topics across rounds.
- Test Mode: isolated sandbox with sample data. No real emails sent. Toggle in header bar.
- Subscription limits: plan determines member count and rounds per year. Change password in Account tab.`,
      messages,
    });

    const answer = response.content[0]?.text || "Sorry, I wasn't able to generate a response.";
    res.json({ answer });
  } catch (err) {
    logger.error({ err }, "Help chatbot error");
    res.status(500).json({ error: "Failed to get a response. Please try again." });
  }
});

export default router;
