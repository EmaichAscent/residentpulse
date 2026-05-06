import { Router } from "express";
import db from "../db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword } from "../utils/password.js";
import { generateClientCode } from "../utils/clientCode.js";
import logger from "../utils/logger.js";
// SuperAdmin AI assistant (the "Propose diff" prompt-editor helper)
// goes through the AI provider router so the "AI provider" toggle
// covers it alongside board chat. invalidateProviderCache lets the
// PUT /ai-provider endpoint bust the cache on toggle.
import { createMessage, invalidateProviderCache } from "../utils/aiRouter.js";
import { getCurrentBlocks, saveNewVersion, getVersionById } from "../utils/promptVersions.js";
import { blocksToPrompt, normalizeBlock } from "../prompts/blocks.js";

const router = Router();

// Exit impersonation (must be before requireSuperAdmin middleware)
// This endpoint is accessible when impersonating (user has originalUser in session)
router.post("/exit-impersonation", (req, res) => {
  if (!req.session.originalUser) {
    return res.status(400).json({ error: "Not currently impersonating" });
  }

  // Restore original superadmin session
  req.session.user = req.session.originalUser;
  delete req.session.originalUser;

  res.json({
    ok: true,
    user: req.session.user,
  });
});

// All other SuperAdmin routes require authentication
router.use(requireSuperAdmin);

// Dashboard aggregate stats
router.get("/dashboard", async (req, res) => {
  try {
    const totalClients = await db.get("SELECT COUNT(*) as count FROM clients");
    const activeClients = await db.get(
      "SELECT COUNT(*) as count FROM clients WHERE status = 'active'"
    );
    const activeRounds = await db.get(
      "SELECT COUNT(*) as count FROM survey_rounds WHERE status = 'in_progress' AND is_test = FALSE"
    );
    const totalResponses = await db.get(
      "SELECT COUNT(*) as count FROM sessions WHERE completed = TRUE AND is_mock IS NOT TRUE AND is_test = FALSE"
    );
    const totalMembers = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE active = TRUE AND is_test = FALSE"
    );

    // Engagement warnings: clients with no admin login in 30+ days (or never)
    const warnings = await db.all(
      `SELECT c.id, c.company_name, c.client_code, MAX(ca.last_login_at) as last_login
       FROM clients c
       LEFT JOIN client_admins ca ON ca.client_id = c.id
       WHERE c.status = 'active'
       GROUP BY c.id, c.company_name, c.client_code
       HAVING MAX(ca.last_login_at) IS NULL OR MAX(ca.last_login_at) < NOW() - INTERVAL '30 days'`
    );

    res.json({
      total_clients: totalClients?.count || 0,
      active_clients: activeClients?.count || 0,
      active_rounds: activeRounds?.count || 0,
      total_responses: totalResponses?.count || 0,
      total_members: totalMembers?.count || 0,
      engagement_warnings: warnings,
    });
  } catch (err) {
    logger.error({ err }, "Dashboard error");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// Today stack — computed operational signals (PR 7 of the SuperAdmin
// overhaul). Replaces the bare vanity totals on the dashboard with
// the four signals from the design handoff §1:
//
//   1. Closing this week    — rounds with closes_at within 7 days
//   2. Active rounds (+ Δ)  — current count + delta vs 7 days ago
//   3. Dormant w/ active    — silent-churn signal: clients with an
//                             active round whose admins haven't
//                             logged in for 14+ days
//   4. Prompts pending      — prompt_versions created in last 7 days
//                             (proxy for "regenerated but not yet
//                             test-interviewed" until we track runs)
//
// Each signal returns { count, label, detail, sample[] } where sample
// is up to 5 client rows the operator can drill into.
router.get("/today-stack", async (req, res) => {
  try {
    // 1. Closing this week
    const closingRows = await db.all(
      `SELECT sr.id, sr.round_number, sr.closes_at, c.id as client_id, c.company_name,
              ROUND(EXTRACT(EPOCH FROM (sr.closes_at - NOW())) / 86400)::int as days_left
       FROM survey_rounds sr
       JOIN clients c ON c.id = sr.client_id
       WHERE sr.status = 'in_progress'
         AND sr.is_test = FALSE
         AND sr.closes_at IS NOT NULL
         AND sr.closes_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY sr.closes_at ASC
       LIMIT 5`
    );
    const closingCount = await db.get(
      `SELECT COUNT(*) as count FROM survey_rounds
       WHERE status = 'in_progress' AND is_test = FALSE
         AND closes_at IS NOT NULL
         AND closes_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );

    // 2. Active rounds (current + 7-days-ago for delta).
    const activeNow = await db.get(
      `SELECT COUNT(*) as count FROM survey_rounds
       WHERE status = 'in_progress' AND is_test = FALSE`
    );
    // "Active 7 days ago" = launched on or before T-7 AND (closed after T-7
    // OR still in_progress). Approximation: launched <= T-7 AND
    // (closes_at IS NULL OR closes_at >= T-7).
    const activeLastWeek = await db.get(
      `SELECT COUNT(*) as count FROM survey_rounds
       WHERE is_test = FALSE
         AND launched_at IS NOT NULL
         AND launched_at <= NOW() - INTERVAL '7 days'
         AND (closes_at IS NULL OR closes_at >= NOW() - INTERVAL '7 days')`
    );

    // 3. Dormant w/ active rounds — silent churn signal.
    const dormantRows = await db.all(
      `SELECT c.id, c.company_name, c.client_code,
              MAX(ca.last_login_at) as last_login,
              COUNT(DISTINCT sr.id) as active_round_count
       FROM clients c
       JOIN survey_rounds sr
         ON sr.client_id = c.id AND sr.status = 'in_progress' AND sr.is_test = FALSE
       LEFT JOIN client_admins ca ON ca.client_id = c.id
       WHERE c.status = 'active'
       GROUP BY c.id, c.company_name, c.client_code
       HAVING MAX(ca.last_login_at) IS NULL
          OR MAX(ca.last_login_at) < NOW() - INTERVAL '14 days'
       ORDER BY MAX(ca.last_login_at) ASC NULLS FIRST
       LIMIT 5`
    );

    // 4. Prompts recently regenerated (proxy for "pending review" until
    // we track test-interview runs).
    const recentPrompts = await db.get(
      `SELECT COUNT(*) as count FROM prompt_versions
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    // 5. No round scheduled — onboarded clients with no active round.
    // Distinguishes "active tenant who needs a nudge" from "tenant who
    // never finished onboarding."
    const noRoundRows = await db.all(
      `SELECT c.id, c.company_name, c.client_code,
              MAX(ca.last_login_at) as last_login,
              (SELECT MAX(launched_at) FROM survey_rounds sr
                WHERE sr.client_id = c.id AND sr.is_test = FALSE) as last_round_launched_at
       FROM clients c
       LEFT JOIN client_admins ca ON ca.client_id = c.id
       WHERE c.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM survey_rounds sr2
            WHERE sr2.client_id = c.id
              AND sr2.status = 'in_progress'
              AND sr2.is_test = FALSE
         )
       GROUP BY c.id, c.company_name, c.client_code
       HAVING BOOL_OR(ca.onboarding_completed) = TRUE
       ORDER BY MAX(ca.last_login_at) DESC NULLS LAST
       LIMIT 5`
    );

    // Header totals — drives the hero subtitle.
    const totalClients = await db.get(
      `SELECT COUNT(*) as count FROM clients WHERE status = 'active'`
    );
    const payingClients = await db.get(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM clients c
       JOIN client_subscriptions cs ON cs.client_id = c.id
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE c.status = 'active' AND sp.price_cents > 0`
    );

    // ── Signal cards (handoff §1 "What needs your attention") ────────
    // Each card is a computed, human-phrased actionable. Severity drives
    // the card's left-border tint (risk = coral, attention = amber,
    // watch = neutral). The whole point of this list is to convert
    // "look at the dashboard" into "here are the 5 things that matter."
    const signals = [];

    // Closing-soon rounds (one card per closing round, capped to 5
    // total signals from this category). Severity escalates with how
    // little time is left.
    const closingForSignals = await db.all(
      `SELECT sr.id, sr.round_number, sr.closes_at, c.id as client_id, c.company_name,
              ROUND(EXTRACT(EPOCH FROM (sr.closes_at - NOW())) / 86400)::int as days_left,
              (SELECT COUNT(*) FROM sessions s
                 WHERE s.round_id = sr.id AND s.completed = TRUE
                   AND s.is_mock IS NOT TRUE AND s.is_test = FALSE) as completed,
              sr.members_invited as invited
       FROM survey_rounds sr
       JOIN clients c ON c.id = sr.client_id
       WHERE sr.status = 'in_progress' AND sr.is_test = FALSE
         AND sr.closes_at IS NOT NULL
         AND sr.closes_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY sr.closes_at ASC
       LIMIT 5`
    );
    for (const r of closingForSignals) {
      const completed = Number(r.completed) || 0;
      const invited = Number(r.invited) || 0;
      const pct = invited > 0 ? Math.round((completed / invited) * 100) : null;
      const tomorrow = r.days_left <= 1;
      signals.push({
        id: `closing-${r.id}`,
        kind: "closing",
        severity: tomorrow ? "attention" : "watch",
        title: `${r.company_name} — round closes ${tomorrow ? "tomorrow" : `in ${r.days_left} days`}`,
        detail:
          invited > 0
            ? `${completed} / ${invited} responses (${pct}%). Round ${r.round_number} active.`
            : `Round ${r.round_number} active.`,
        client_id: r.client_id,
        cta: "Open client",
      });
    }

    // Dormant + active round = highest-priority risk.
    for (const c of dormantRows) {
      const days = c.last_login
        ? Math.floor((Date.now() - new Date(c.last_login).getTime()) / 86400000)
        : null;
      signals.push({
        id: `dormant-${c.id}`,
        kind: "dormant-active",
        severity: "risk",
        title: c.last_login
          ? `${c.company_name} hasn't logged in for ${days} days`
          : `${c.company_name} has never logged in`,
        detail: `Active round in flight, but admin hasn't seen it. ${c.active_round_count} live round${c.active_round_count > 1 ? "s" : ""}.`,
        client_id: c.id,
        cta: "Open client",
      });
    }

    // Paid + dormant 60+d = silent-churn risk on revenue accounts.
    const churnRiskRows = await db.all(
      `SELECT c.id, c.company_name, sp.display_name as plan_name,
              MAX(ca.last_login_at) as last_login
       FROM clients c
       JOIN client_subscriptions cs ON cs.client_id = c.id
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       LEFT JOIN client_admins ca ON ca.client_id = c.id
       WHERE c.status = 'active' AND sp.price_cents > 0
       GROUP BY c.id, c.company_name, sp.display_name
       HAVING MAX(ca.last_login_at) IS NULL
          OR MAX(ca.last_login_at) < NOW() - INTERVAL '60 days'
       ORDER BY MAX(ca.last_login_at) ASC NULLS FIRST
       LIMIT 3`
    );
    for (const c of churnRiskRows) {
      const days = c.last_login
        ? Math.floor((Date.now() - new Date(c.last_login).getTime()) / 86400000)
        : null;
      signals.push({
        id: `churn-${c.id}`,
        kind: "churn-risk",
        severity: "risk",
        title: `${c.company_name} — paid ${c.plan_name}, ${days ?? "?"}d dormant`,
        detail:
          "Revenue account has gone dark. No round in flight. Likely silent churn — reach out before renewal.",
        client_id: c.id,
        cta: "Open client",
      });
    }

    // Recently edited prompt → "test-interview before next round."
    const recentPromptRows = await db.all(
      `SELECT pv.id, pv.prompt_key, pv.version_number, pv.created_at, pv.created_by
       FROM prompt_versions pv
       WHERE pv.created_at >= NOW() - INTERVAL '7 days'
       ORDER BY pv.created_at DESC
       LIMIT 2`
    );
    for (const pv of recentPromptRows) {
      const labelMap = {
        system_prompt: "Board interview",
        interview_initial_prompt: "Client onboarding",
        prompt_generation_instruction: "Supplement generator",
        interview_re_prompt: "Re-interview",
      };
      signals.push({
        id: `prompt-${pv.id}`,
        kind: "prompt-pending",
        severity: "attention",
        title: `${labelMap[pv.prompt_key] || pv.prompt_key} prompt edited recently (v${pv.version_number ?? "?"})`,
        detail: `Edited by ${pv.created_by || "unknown"}. Run the test interview before this hits a real board.`,
        client_id: null,
        cta: "Test prompt",
      });
    }

    // "Watch" signals — onboarded but no round ever launched.
    const neverRanRows = await db.all(
      `SELECT c.id, c.company_name,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400)::int as days_since_signup,
              sp.display_name as plan_name
       FROM clients c
       LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
       LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
       LEFT JOIN client_admins ca ON ca.client_id = c.id
       WHERE c.status = 'active'
         AND c.created_at < NOW() - INTERVAL '30 days'
         AND NOT EXISTS (
           SELECT 1 FROM survey_rounds sr WHERE sr.client_id = c.id AND sr.is_test = FALSE
         )
       GROUP BY c.id, c.company_name, c.created_at, sp.display_name
       HAVING BOOL_OR(ca.onboarding_completed) = TRUE
       ORDER BY c.created_at ASC
       LIMIT 3`
    );
    for (const c of neverRanRows) {
      signals.push({
        id: `never-${c.id}`,
        kind: "never-launched",
        severity: "watch",
        title: `${c.company_name} onboarded ${c.days_since_signup} days ago, never launched a round`,
        detail: `${c.plan_name || "No plan"}. May need outreach or could be deprioritized.`,
        client_id: c.id,
        cta: "Open client",
      });
    }

    // Sort risk → attention → watch so the cards stack with the urgent
    // ones up top.
    const SEVERITY_ORDER = { risk: 0, attention: 1, watch: 2 };
    signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    res.json({
      header: {
        signals_count: signals.length,
        clients_count: Number(totalClients?.count) || 0,
        paying_count: Number(payingClients?.count) || 0,
      },
      signals,
      closing_this_week: {
        count: Number(closingCount?.count) || 0,
        sample: closingRows,
      },
      active_rounds: {
        count: Number(activeNow?.count) || 0,
        last_week: Number(activeLastWeek?.count) || 0,
        delta: (Number(activeNow?.count) || 0) - (Number(activeLastWeek?.count) || 0),
      },
      dormant_with_active: {
        count: dormantRows.length,
        sample: dormantRows,
      },
      no_round_scheduled: {
        count: noRoundRows.length,
        sample: noRoundRows,
      },
      prompts_recent: {
        count: Number(recentPrompts?.count) || 0,
      },
    });
  } catch (err) {
    logger.error({ err }, "Today-stack error");
    res.status(500).json({ error: "Failed to load today stack" });
  }
});

// Categorize an activity_log row's `action` into one of the dashboard's
// event-pill kinds. Pure mapping function — keeps the dashboard's color-
// coding consistent and makes filter chips (Rounds / Prompts / etc) work
// without any new columns.
function categorizeActivity(action = "") {
  if (action === "login") return "login";
  if (action.includes("round")) return "round";
  if (action.includes("prompt") || action.includes("supplement")) return "prompt";
  if (action.includes("interview") || action.includes("session")) return "session";
  if (action.includes("impersonat")) return "impersonate";
  if (action.includes("insight")) return "insight";
  return "system";
}

// ── AI provider toggle (Anthropic vs xAI) ──────────────────────────
// Reads/writes the global `ai_provider` setting that aiRouter.js
// dispatches on. PUT invalidates the in-memory provider cache so the
// switch is visible on the very next chat call.
const AI_PROVIDERS = ["anthropic", "xai"];
const AI_PROVIDER_KEY = "ai_provider";

router.get("/ai-provider", async (_req, res) => {
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = ? AND client_id IS NULL", [
      AI_PROVIDER_KEY,
    ]);
    const provider = row?.value && AI_PROVIDERS.includes(row.value) ? row.value : "anthropic";
    // Surface whether the operator has configured the xAI key yet — the
    // SuperAdmin UI uses this to disable the "xai" radio button when
    // the env var is missing, instead of letting the operator switch
    // and then break every chat with "XAI_API_KEY not set" errors.
    const xaiKeyConfigured = Boolean(process.env.XAI_API_KEY);
    res.json({ provider, xai_key_configured: xaiKeyConfigured, options: AI_PROVIDERS });
  } catch (err) {
    logger.error({ err }, "Failed to read ai_provider setting");
    res.status(500).json({ error: "Failed to read AI provider setting" });
  }
});

router.put("/ai-provider", async (req, res) => {
  const { provider } = req.body || {};
  if (!AI_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `provider must be one of: ${AI_PROVIDERS.join(", ")}` });
  }
  if (provider === "xai" && !process.env.XAI_API_KEY) {
    return res.status(400).json({
      error:
        "Cannot switch to xAI: XAI_API_KEY is not set in the server environment. " +
        "Add it in Railway → Variables before flipping the toggle.",
    });
  }
  try {
    await db.run("UPDATE settings SET value = ? WHERE key = ? AND client_id IS NULL", [
      provider,
      AI_PROVIDER_KEY,
    ]);
    invalidateProviderCache();
    logger.info({ provider, actor: req.session?.user?.email }, "ai_provider switched");
    res.json({ ok: true, provider });
  } catch (err) {
    logger.error({ err }, "Failed to write ai_provider setting");
    res.status(500).json({ error: "Failed to update AI provider setting" });
  }
});

// Activity log (paginated). Per design handoff §1: logins are
// de-emphasized and excluded by default — they live under System Log.
// Pass ?include_logins=true to bring them back, or ?kind=<kind> to
// filter to one event type (round / prompt / session / impersonate /
// insight / system).
router.get("/activity-log", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const includeLogins = req.query.include_logins === "true";
    const kindFilter = typeof req.query.kind === "string" ? req.query.kind : null;

    const where = [];
    const params = [];
    if (!includeLogins && !kindFilter) {
      where.push("al.action <> 'login'");
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // Pull a wider window than `limit` so we can apply the kind filter
    // post-fetch without paginating wrong (kind is computed in JS).
    const fetchLimit = kindFilter ? Math.min(500, limit * 5) : limit;
    const entries = await db.all(
      `SELECT al.*, c.company_name
       FROM activity_log al
       LEFT JOIN clients c ON c.id = al.client_id
       ${whereSql}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, fetchLimit, offset]
    );

    const enriched = entries.map((e) => ({ ...e, kind: categorizeActivity(e.action) }));
    const filtered = kindFilter ? enriched.filter((e) => e.kind === kindFilter) : enriched;
    const final = filtered.slice(0, limit);

    const total = await db.get(`SELECT COUNT(*) as count FROM activity_log al ${whereSql}`, params);

    res.json({
      entries: final,
      total: total?.count || 0,
      page,
      limit,
    });
  } catch (err) {
    logger.error({ err }, "Activity log error");
    res.status(500).json({ error: "Failed to load activity log" });
  }
});

// Get all clients (simplified for list view)
router.get("/clients", async (req, res) => {
  // Enriched per-client view (PR 8 of the SuperAdmin overhaul) so the
  // Clients list can compute health dots and apply filter chips:
  //
  //   • active_round_count    — drives the "no round" / "active" filter
  //                             chips and the dormant-with-active health
  //                             flag
  //   • onboarding_complete   — any admin has finished onboarding?
  //                             ("onboarding incomplete" filter chip)
  //   • last_round_launched_at — most recent launched round date
  //                             (helps differentiate "never run" vs
  //                             "ran a long time ago")
  //
  // Health is then computed client-side from these fields; keeping it
  // there lets us iterate on health rules without a server deploy.
  const clients = await db.all(
    `SELECT c.id, c.company_name, c.client_code, c.status, c.created_at,
            c.test_mode_activated_at,
            sp.display_name as plan_name, sp.name as plan_key,
            MAX(ca.last_login_at) as last_activity,
            COUNT(DISTINCT ca.id) as admin_count,
            BOOL_OR(ca.onboarding_completed) as onboarding_complete,
            (SELECT COUNT(*) FROM survey_rounds sr
              WHERE sr.client_id = c.id
                AND sr.status = 'in_progress'
                AND sr.is_test = FALSE) as active_round_count,
            (SELECT MAX(launched_at) FROM survey_rounds sr
              WHERE sr.client_id = c.id
                AND sr.is_test = FALSE) as last_round_launched_at
     FROM clients c
     LEFT JOIN client_admins ca ON ca.client_id = c.id
     LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     GROUP BY c.id, c.company_name, c.client_code, c.status, c.created_at,
              c.test_mode_activated_at, sp.display_name, sp.name
     ORDER BY c.created_at DESC`
  );
  res.json(clients);
});

// Create new client
router.post("/clients", async (req, res) => {
  const {
    company_name,
    address_line1,
    address_line2,
    city,
    state,
    zip,
    phone_number,
    admin_email,
  } = req.body;

  if (!company_name || !admin_email) {
    return res.status(400).json({ error: "Company name and admin email are required" });
  }

  // Check if admin email already exists
  const existingAdmin = await db.get("SELECT id FROM client_admins WHERE email = ?", [
    admin_email.toLowerCase().trim(),
  ]);
  if (existingAdmin) {
    return res.status(400).json({ error: "An admin with this email already exists" });
  }

  try {
    // Create client with unique code
    const clientCode = await generateClientCode();
    const clientResult = await db.run(
      "INSERT INTO clients (company_name, address_line1, address_line2, city, state, zip, phone_number, status, client_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        company_name,
        address_line1 || null,
        address_line2 || null,
        city || null,
        state || null,
        zip || null,
        phone_number || null,
        "active",
        clientCode,
      ]
    );
    const clientId = clientResult.lastInsertRowid;

    // Generate temporary password
    const tempPassword = generatePassword(16);
    const passwordHash = await hashPassword(tempPassword);

    // Create first admin user for this client
    await db.run("INSERT INTO client_admins (client_id, email, password_hash) VALUES (?, ?, ?)", [
      clientId,
      admin_email.toLowerCase().trim(),
      passwordHash,
    ]);

    // Copy system prompt to this client
    const globalPrompt = await db.get(
      "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL"
    );
    if (globalPrompt) {
      await db.run("INSERT INTO settings (key, value, client_id) VALUES ('system_prompt', ?, ?)", [
        globalPrompt.value,
        clientId,
      ]);
    }

    // Assign default free plan
    const freePlan = await db.get("SELECT id FROM subscription_plans WHERE name = 'free'");
    if (freePlan) {
      await db.run(
        "INSERT INTO client_subscriptions (client_id, plan_id, status) VALUES (?, ?, 'active')",
        [clientId, freePlan.id]
      );
    }

    res.json({
      ok: true,
      client_id: clientId,
      client_code: clientCode,
      admin_email: admin_email.toLowerCase().trim(),
      temp_password: tempPassword,
      message: "Client created successfully. Share these credentials with the client admin.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error creating client");
    res.status(500).json({ error: "Failed to create client" });
  }
});

// Update client info
router.put("/clients/:id", async (req, res) => {
  const { id } = req.params;
  const { company_name, address_line1, address_line2, city, state, zip, phone_number } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: "Company name is required" });
  }

  await db.run(
    "UPDATE clients SET company_name = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, zip = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [
      company_name,
      address_line1 || null,
      address_line2 || null,
      city || null,
      state || null,
      zip || null,
      phone_number || null,
      id,
    ]
  );

  res.json({ ok: true });
});

// Toggle client status (activate/deactivate)
router.patch("/clients/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["active", "inactive"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'active' or 'inactive'" });
  }

  await db.run("UPDATE clients SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
    status,
    id,
  ]);

  res.json({ ok: true, status });
});

// Impersonate a client (switch to client admin view)
router.post("/clients/:id/impersonate", async (req, res) => {
  const { id } = req.params;

  const client = await db.get("SELECT * FROM clients WHERE id = ?", [id]);

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  if (client.status !== "active") {
    return res.status(403).json({ error: "Cannot impersonate inactive client" });
  }

  // Get any admin user for this client (we'll use the first one)
  const admin = await db.get("SELECT * FROM client_admins WHERE client_id = ? LIMIT 1", [id]);

  if (!admin) {
    return res.status(404).json({ error: "No admin users found for this client" });
  }

  // Get plan name for tier gating
  const sub = await db.get(
    `SELECT sp.name as plan_name FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ? AND cs.status = 'active'`,
    [id]
  );

  // Store original superadmin session
  req.session.originalUser = req.session.user;

  // Switch to client admin context
  req.session.user = {
    id: admin.id,
    email: admin.email,
    role: "client_admin",
    client_id: client.id,
    company_name: client.company_name,
    plan_name: sub?.plan_name || "free",
    impersonating: true,
  };

  res.json({
    ok: true,
    user: req.session.user,
  });
});

// Get global system prompt
router.get("/prompt", async (req, res) => {
  const setting = await db.get(
    "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL"
  );
  res.json({ prompt: setting?.value || "" });
});

// Keys that the prompt-versioning system supports. Used as a allowlist
// for the version endpoints so callers can't write to arbitrary settings rows.
const VERSIONED_PROMPT_KEYS = [
  "system_prompt",
  "interview_initial_prompt",
  "interview_re_prompt",
  "prompt_generation_instruction",
];

/**
 * Auto-save the current value of a global prompt as a version before it's
 * overwritten. Idempotent — skips if the new value equals the current one.
 */
async function autoSaveVersion(key, newValue, actorEmail) {
  const current = await db.get("SELECT value FROM settings WHERE key = ? AND client_id IS NULL", [
    key,
  ]);
  if (current?.value && current.value !== newValue) {
    await db.run(
      "INSERT INTO prompt_versions (prompt_key, prompt_text, label, created_by) VALUES (?, ?, ?, ?)",
      [key, current.value, "Auto-save", actorEmail || "unknown"]
    );
  }
}

// Update global system prompt (auto-saves previous version)
router.put("/prompt", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    await autoSaveVersion("system_prompt", prompt, req.session.user?.email);

    // Try UPDATE first (row seeded on startup)
    const result = await db.run(
      "UPDATE settings SET value = ? WHERE key = 'system_prompt' AND client_id IS NULL",
      [prompt]
    );

    // If no row existed, insert it
    if (!result.changes) {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES ('system_prompt', ?, NULL)",
        [prompt]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error saving prompt");
    res.status(500).json({ error: "Failed to save prompt" });
  }
});

// Get interview prompts (all three)
router.get("/interview-prompts", async (req, res) => {
  try {
    const initial = await db.get(
      "SELECT value FROM settings WHERE key = 'interview_initial_prompt' AND client_id IS NULL"
    );
    const re = await db.get(
      "SELECT value FROM settings WHERE key = 'interview_re_prompt' AND client_id IS NULL"
    );
    const generation = await db.get(
      "SELECT value FROM settings WHERE key = 'prompt_generation_instruction' AND client_id IS NULL"
    );
    res.json({
      interview_initial_prompt: initial?.value || "",
      interview_re_prompt: re?.value || "",
      prompt_generation_instruction: generation?.value || "",
    });
  } catch (err) {
    logger.error({ err }, "Error loading interview prompts");
    res.status(500).json({ error: "Failed to load interview prompts" });
  }
});

// Update an interview prompt (auto-saves previous version)
router.put("/interview-prompts", async (req, res) => {
  const { key, value } = req.body;
  const validKeys = [
    "interview_initial_prompt",
    "interview_re_prompt",
    "prompt_generation_instruction",
  ];

  if (!validKeys.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }

  if (!value) {
    return res.status(400).json({ error: "Prompt value is required" });
  }

  try {
    await autoSaveVersion(key, value, req.session.user?.email);

    const result = await db.run(
      "UPDATE settings SET value = ? WHERE key = ? AND client_id IS NULL",
      [value, key]
    );
    if (!result.changes) {
      await db.run("INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL)", [
        key,
        value,
      ]);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error saving interview prompt");
    res.status(500).json({ error: "Failed to save interview prompt" });
  }
});

// Get saved prompt versions for a specific prompt key.
// Defaults to system_prompt for backward compatibility with the original UI.
router.get("/prompt/versions", async (req, res) => {
  const key = req.query.key || "system_prompt";

  if (!VERSIONED_PROMPT_KEYS.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }

  try {
    const versions = await db.all(
      "SELECT * FROM prompt_versions WHERE prompt_key = ? ORDER BY created_at DESC",
      [key]
    );
    res.json(versions);
  } catch (err) {
    logger.error({ err }, "Error loading prompt versions");
    res.status(500).json({ error: "Failed to load versions" });
  }
});

// Save current prompt as a named version. Body: { prompt_text, label, key? }
router.post("/prompt/versions", async (req, res) => {
  const { prompt_text, label } = req.body;
  const key = req.body.key || "system_prompt";

  if (!VERSIONED_PROMPT_KEYS.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }
  if (!prompt_text) {
    return res.status(400).json({ error: "prompt_text is required" });
  }

  try {
    const result = await db.run(
      "INSERT INTO prompt_versions (prompt_key, prompt_text, label, created_by) VALUES (?, ?, ?, ?)",
      [key, prompt_text, label || "Saved version", req.session.user?.email || "unknown"]
    );
    const version = await db.get("SELECT * FROM prompt_versions WHERE id = ?", [
      result.lastInsertRowid,
    ]);
    res.json(version);
  } catch (err) {
    logger.error({ err }, "Error saving prompt version");
    res.status(500).json({ error: "Failed to save version" });
  }
});

// Delete a prompt version
router.delete("/prompt/versions/:id", async (req, res) => {
  try {
    await db.run("DELETE FROM prompt_versions WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting prompt version");
    res.status(500).json({ error: "Failed to delete version" });
  }
});

// Restore a prompt version: set its prompt_text as the current value of the
// matching prompt_key. Auto-saves the previous current value first so the
// restore itself is undoable.
router.post("/prompt/versions/:id/restore", async (req, res) => {
  try {
    const version = await db.get("SELECT * FROM prompt_versions WHERE id = ?", [req.params.id]);
    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    const key = version.prompt_key;
    if (!VERSIONED_PROMPT_KEYS.includes(key)) {
      return res.status(400).json({ error: "Version's prompt key is invalid" });
    }

    await autoSaveVersion(key, version.prompt_text, req.session.user?.email);

    const result = await db.run(
      "UPDATE settings SET value = ? WHERE key = ? AND client_id IS NULL",
      [version.prompt_text, key]
    );
    if (!result.changes) {
      await db.run("INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL)", [
        key,
        version.prompt_text,
      ]);
    }

    res.json({ ok: true, restored_version_id: Number(req.params.id), key });
  } catch (err) {
    logger.error({ err }, "Error restoring prompt version");
    res.status(500).json({ error: "Failed to restore version" });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// SuperAdmin PR 2 — structured-block read/write for the new Prompts Library
//
// These complement the existing text-based endpoints. The new editor
// reads/writes blocks; the runtime (chat.js / interview.js) keeps
// reading from settings.value as a string. Both stay in sync because
// the block writes also update settings.value (assembled from blocks).
// ──────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/prompts/:key/blocks
 *
 * Returns the live blocks for a prompt_key — sourced from settings.value
 * (the runtime source of truth), parsed into the structured-block
 * format the SuperAdmin editor renders. Best-effort matches the result
 * to a prompt_versions row so the UI can show "v7 · Updated 2 hours
 * ago by mike@…" alongside the live content.
 */
router.get("/prompts/:key/blocks", async (req, res) => {
  const key = req.params.key;
  if (!VERSIONED_PROMPT_KEYS.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }
  try {
    const result = await getCurrentBlocks(key);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Error loading current prompt blocks");
    res.status(500).json({ error: "Failed to load prompt blocks" });
  }
});

/**
 * PUT /api/superadmin/prompts/:key/blocks
 * Body: { blocks: [{heading, kind, body}, …], note?: string, label?: string }
 *
 * Saves new blocks: creates a prompt_versions row (with both
 * blocks_jsonb and the assembled prompt_text) AND updates the live
 * settings.value so the runtime picks it up immediately.
 *
 * Idempotent — if the assembled text equals the current settings
 * value, returns the current version row without creating a duplicate.
 */
router.put("/prompts/:key/blocks", async (req, res) => {
  const key = req.params.key;
  if (!VERSIONED_PROMPT_KEYS.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }
  const { blocks, note, label } = req.body || {};
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: "blocks (non-empty array) is required" });
  }
  try {
    const normalized = blocks.map(normalizeBlock);
    const assembledText = blocksToPrompt(normalized);

    // Idempotent guard: if the new assembled text matches the current
    // settings value byte-for-byte, this is a no-op. Return the
    // current row so the client can refresh metadata without writing.
    const currentSetting = await db.get(
      "SELECT value FROM settings WHERE key = ? AND client_id IS NULL",
      [key]
    );
    if (currentSetting?.value === assembledText) {
      return res.json(await getCurrentBlocks(key));
    }

    // Auto-save the previous value as a version BEFORE we overwrite it
    // — same pattern as autoSaveVersion() but using the new block-aware
    // saveNewVersion helper so the previous-value version is logged with
    // its own blocks_jsonb populated for the diff modal.
    if (currentSetting?.value && currentSetting.value !== assembledText) {
      await saveNewVersion({
        promptKey: key,
        promptText: currentSetting.value,
        label: "Auto-save (pre-edit)",
        note: "Auto-saved before structured-block edit",
        createdBy: req.session.user?.email,
      });
    }

    // Save the new blocks as a versioned row, then update settings.
    const newVersion = await saveNewVersion({
      promptKey: key,
      blocks: normalized,
      label: label || "Edited via structured editor",
      note: note || null,
      createdBy: req.session.user?.email,
    });

    await db.run("UPDATE settings SET value = ? WHERE key = ? AND client_id IS NULL", [
      assembledText,
      key,
    ]);

    res.json({
      prompt_key: key,
      prompt_text: assembledText,
      blocks: newVersion.blocks,
      version_number: newVersion.version_number,
      label: newVersion.label,
      note: newVersion.note,
      created_by: newVersion.created_by,
      created_at: newVersion.created_at,
      version_id: newVersion.id,
    });
  } catch (err) {
    logger.error({ err }, "Error saving prompt blocks");
    res.status(500).json({ error: "Failed to save prompt blocks" });
  }
});

/**
 * GET /api/superadmin/prompts/:key/versions/:id/blocks
 *
 * Returns a specific prompt version's blocks — used by the diff modal
 * to render the "before" side of a side-by-side comparison.
 */
router.get("/prompts/:key/versions/:id/blocks", async (req, res) => {
  const key = req.params.key;
  if (!VERSIONED_PROMPT_KEYS.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }
  try {
    const version = await getVersionById(req.params.id);
    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }
    if (version.prompt_key !== key) {
      return res.status(400).json({ error: "Version belongs to a different prompt key" });
    }
    res.json(version);
  } catch (err) {
    logger.error({ err }, "Error loading version blocks");
    res.status(500).json({ error: "Failed to load version" });
  }
});

// AI Prompt Assistant — Claude refines the prompt based on instructions
router.post("/prompt/assistant", async (req, res) => {
  const { current_prompt, instructions } = req.body;

  if (!instructions) {
    return res.status(400).json({ error: "Instructions are required" });
  }

  try {
    const response = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system:
        "You are an expert prompt engineer. The user has an existing AI system prompt that is used to conduct NPS (Net Promoter Score) surveys with HOA board members via conversational AI. They want you to improve or modify it based on their instructions. Return ONLY the full updated prompt text with no preamble, explanation, or commentary. Do not wrap it in code blocks or quotes.",
      messages: [
        {
          role: "user",
          content: current_prompt
            ? `Here is the current system prompt:\n\n${current_prompt}\n\nPlease make the following changes:\n${instructions}`
            : `Please create a system prompt for an AI that conducts NPS surveys with HOA board members. Here are the requirements:\n${instructions}`,
        },
      ],
    });

    const improvedPrompt = response.content[0].text;
    res.json({ prompt: improvedPrompt });
  } catch (err) {
    logger.error({ err }, "Error calling AI assistant");
    res.status(500).json({ error: "AI assistant failed. Please try again." });
  }
});

// Get all subscription plans (with client counts)
router.get("/plans", async (req, res) => {
  const plans = await db.all(
    `SELECT sp.*,
            COUNT(cs.id) as client_count
     FROM subscription_plans sp
     LEFT JOIN client_subscriptions cs ON cs.plan_id = sp.id
     GROUP BY sp.id
     ORDER BY sp.sort_order`
  );
  res.json(plans);
});

// Create a new subscription plan
router.post("/plans", async (req, res) => {
  const {
    name,
    display_name,
    member_limit,
    survey_rounds_per_year,
    price_cents,
    is_public,
    sort_order,
    zoho_plan_code,
  } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ error: "name and display_name are required" });
  }

  const existing = await db.get("SELECT id FROM subscription_plans WHERE name = ?", [name]);
  if (existing) {
    return res.status(400).json({ error: "A plan with this name already exists" });
  }

  try {
    const result = await db.run(
      `INSERT INTO subscription_plans (name, display_name, member_limit, survey_rounds_per_year, price_cents, is_public, sort_order, zoho_plan_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        display_name,
        member_limit || 0,
        survey_rounds_per_year || 2,
        price_cents ?? null,
        is_public ?? true,
        sort_order || 0,
        zoho_plan_code || null,
      ]
    );
    const plan = await db.get("SELECT * FROM subscription_plans WHERE id = ?", [
      result.lastInsertRowid,
    ]);
    res.json(plan);
  } catch (err) {
    logger.error({ err }, "Error creating plan");
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// Update a subscription plan
router.put("/plans/:id", async (req, res) => {
  const {
    display_name,
    member_limit,
    survey_rounds_per_year,
    price_cents,
    is_public,
    sort_order,
    zoho_plan_code,
  } = req.body;

  if (!display_name) {
    return res.status(400).json({ error: "display_name is required" });
  }

  try {
    await db.run(
      `UPDATE subscription_plans SET display_name = ?, member_limit = ?, survey_rounds_per_year = ?, price_cents = ?, is_public = ?, sort_order = ?, zoho_plan_code = ?
       WHERE id = ?`,
      [
        display_name,
        member_limit || 0,
        survey_rounds_per_year || 2,
        price_cents ?? null,
        is_public ?? true,
        sort_order || 0,
        zoho_plan_code || null,
        req.params.id,
      ]
    );
    const plan = await db.get("SELECT * FROM subscription_plans WHERE id = ?", [req.params.id]);
    res.json(plan);
  } catch (err) {
    logger.error({ err }, "Error updating plan");
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// Delete a subscription plan (only if no clients are using it)
router.delete("/plans/:id", async (req, res) => {
  const plan = await db.get("SELECT * FROM subscription_plans WHERE id = ?", [req.params.id]);
  if (!plan) {
    return res.status(404).json({ error: "Plan not found" });
  }

  if (plan.name === "free") {
    return res.status(400).json({ error: "Cannot delete the free plan" });
  }

  const usage = await db.get(
    "SELECT COUNT(*) as count FROM client_subscriptions WHERE plan_id = ?",
    [req.params.id]
  );
  if (usage?.count > 0) {
    return res
      .status(400)
      .json({ error: `Cannot delete — ${usage.count} client(s) are on this plan` });
  }

  try {
    await db.run("DELETE FROM subscription_plans WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting plan");
    res.status(500).json({ error: "Failed to delete plan" });
  }
});

// Get subscription for a specific client
router.get("/clients/:id/subscription", async (req, res) => {
  const subscription = await db.get(
    `SELECT cs.*, sp.name as plan_name, sp.display_name as plan_display_name,
            COALESCE(cs.custom_member_limit, sp.member_limit) as member_limit,
            sp.survey_rounds_per_year
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ?`,
    [req.params.id]
  );
  res.json(subscription || null);
});

// Update subscription plan for a client
router.patch("/clients/:id/subscription", async (req, res) => {
  const { plan_id, custom_member_limit, zoho_subscription_id } = req.body;
  const clientId = req.params.id;

  if (!plan_id) {
    return res.status(400).json({ error: "plan_id is required" });
  }

  // Verify plan exists
  const plan = await db.get("SELECT id, name FROM subscription_plans WHERE id = ?", [plan_id]);
  if (!plan) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  // Validate custom plan fields
  if (plan.name === "custom") {
    if (!custom_member_limit || custom_member_limit < 1) {
      return res.status(400).json({ error: "Custom plan requires a member limit greater than 0" });
    }
  }

  const customLimit = plan.name === "custom" ? custom_member_limit : null;
  const zohoSubId = zoho_subscription_id || null;

  // Check if subscription exists
  const existing = await db.get("SELECT id FROM client_subscriptions WHERE client_id = ?", [
    clientId,
  ]);

  if (existing) {
    await db.run(
      "UPDATE client_subscriptions SET plan_id = ?, status = 'active', cancel_at_period_end = FALSE, custom_member_limit = ?, zoho_subscription_id = ? WHERE client_id = ?",
      [plan_id, customLimit, zohoSubId, clientId]
    );
  } else {
    await db.run(
      "INSERT INTO client_subscriptions (client_id, plan_id, status, custom_member_limit, zoho_subscription_id) VALUES (?, ?, 'active', ?, ?)",
      [clientId, plan_id, customLimit, zohoSubId]
    );
  }

  // If upgrading to a paid tier, seed communities from existing board member data
  const newPlan = await db.get("SELECT name FROM subscription_plans WHERE id = ?", [plan_id]);
  if (newPlan && newPlan.name !== "free") {
    try {
      const distinctNames = await db.all(
        `SELECT DISTINCT community_name FROM users
         WHERE client_id = ? AND community_name IS NOT NULL AND TRIM(community_name) != '' AND active = TRUE
         AND LOWER(TRIM(community_name)) NOT IN (
           SELECT LOWER(TRIM(community_name)) FROM communities WHERE client_id = ?
         )`,
        [clientId, clientId]
      );

      for (const row of distinctNames) {
        await db.run("INSERT INTO communities (client_id, community_name) VALUES (?, ?)", [
          clientId,
          row.community_name.trim(),
        ]);
      }

      // Auto-link users to communities
      if (db.pool) {
        await db.pool.query(
          `UPDATE users u SET community_id = c.id
           FROM communities c
           WHERE u.client_id = c.client_id AND u.client_id = $1
             AND LOWER(TRIM(u.community_name)) = LOWER(TRIM(c.community_name))
             AND u.community_id IS NULL`,
          [clientId]
        );
      }
    } catch (err) {
      logger.error({ err }, "Failed to seed communities on upgrade");
    }
  }

  res.json({ ok: true });
});

// Diagnostic endpoint to investigate client data issues
router.get("/clients/:id/diagnostics", async (req, res) => {
  const clientId = Number(req.params.id);

  try {
    // 1. Client info
    const client = await db.get("SELECT * FROM clients WHERE id = ?", [clientId]);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // 2. All board members (users) for this client
    const users = await db.all(
      "SELECT id, email, first_name, last_name, client_id, active, invitation_token, invitation_token_expires, last_invited_at FROM users WHERE client_id = ?",
      [clientId]
    );

    // 3. All sessions for this client_id
    const sessionsByClientId = await db.all(
      "SELECT id, email, client_id, user_id, round_id, nps_score, completed, created_at, summary FROM sessions WHERE client_id = ?",
      [clientId]
    );

    // 4. All sessions matching any of this client's user emails (regardless of client_id)
    const userEmails = users.map((u) => u.email);
    let sessionsByEmail = [];
    if (userEmails.length > 0) {
      const placeholders = userEmails.map((_, i) => `$${i + 1}`).join(", ");
      const result = await db.pool.query(
        `SELECT id, email, client_id, user_id, round_id, nps_score, completed, created_at, summary FROM sessions WHERE LOWER(email) IN (${placeholders})`,
        userEmails.map((e) => e.toLowerCase())
      );
      sessionsByEmail = result.rows;
    }

    // 5. Sessions with NULL client_id (orphaned)
    const orphanedSessions = await db.all(
      "SELECT id, email, client_id, user_id, round_id, nps_score, completed, created_at FROM sessions WHERE client_id IS NULL"
    );

    // 6. Survey rounds for this client
    const surveyRounds = await db.all("SELECT * FROM survey_rounds WHERE client_id = ?", [
      clientId,
    ]);

    // 7. Invitation logs for this client
    const invitationLogs = await db.all(
      "SELECT il.*, u.email as user_email FROM invitation_logs il LEFT JOIN users u ON u.id = il.user_id WHERE il.client_id = ?",
      [clientId]
    );

    // 8. Client admins
    const admins = await db.all(
      "SELECT id, email, client_id, created_at FROM client_admins WHERE client_id = ?",
      [clientId]
    );

    res.json({
      client,
      admins,
      users,
      sessions_by_client_id: sessionsByClientId,
      sessions_by_email: sessionsByEmail,
      orphaned_sessions: orphanedSessions,
      survey_rounds: surveyRounds,
      invitation_logs: invitationLogs,
    });
  } catch (err) {
    logger.error({ err }, "Diagnostics error");
    res.status(500).json({ error: err.message });
  }
});

// Reassign a session to the correct client (fix mismatched client_id)
router.patch("/sessions/:id/reassign", async (req, res) => {
  const sessionId = Number(req.params.id);
  const { client_id, round_id } = req.body;

  if (!client_id) {
    return res.status(400).json({ error: "client_id is required" });
  }

  // Verify client exists
  const client = await db.get("SELECT id FROM clients WHERE id = ?", [client_id]);
  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  // Verify session exists
  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [sessionId]);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  await db.run("UPDATE sessions SET client_id = ?, round_id = ? WHERE id = ?", [
    client_id,
    round_id || null,
    sessionId,
  ]);

  const updated = await db.get("SELECT * FROM sessions WHERE id = ?", [sessionId]);
  res.json({ ok: true, session: updated });
});

// Client detail (consolidated view)
router.get("/clients/:id/detail", async (req, res) => {
  const clientId = Number(req.params.id);

  try {
    const client = await db.get("SELECT * FROM clients WHERE id = ?", [clientId]);
    if (!client) return res.status(404).json({ error: "Client not found" });

    // Subscription
    const subscription = await db.get(
      `SELECT cs.*, sp.name as plan_name, sp.display_name as plan_display_name,
              COALESCE(cs.custom_member_limit, sp.member_limit) as member_limit,
              sp.survey_rounds_per_year
       FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ?`,
      [clientId]
    );

    // Admins with last login
    const admins = await db.all(
      "SELECT id, email, first_name, last_name, created_at, last_login_at, onboarding_completed FROM client_admins WHERE client_id = ?",
      [clientId]
    );

    // Member + community counts
    const memberCount = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE",
      [clientId]
    );
    const communityCount = await db.get(
      "SELECT COUNT(DISTINCT community_name) as count FROM users WHERE client_id = ? AND community_name IS NOT NULL AND active = TRUE",
      [clientId]
    );

    // Latest interview
    const latestInterview = await db.get(
      "SELECT id, interview_type, status, generated_prompt, interview_summary, created_at, completed_at FROM admin_interviews WHERE client_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
      [clientId]
    );

    // Active interview prompt supplement
    const promptSupplement = await db.get(
      "SELECT value FROM settings WHERE key = 'interview_prompt_supplement' AND client_id = ?",
      [clientId]
    );

    // Detractor alert threshold
    const detractorSetting = await db.get(
      "SELECT value FROM settings WHERE key = 'detractor_alert_threshold' AND client_id = ?",
      [clientId]
    );

    // Survey rounds
    const surveyRounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true AND s.is_mock IS NOT TRUE) as responses_completed,
              (SELECT COUNT(DISTINCT il.user_id) FROM invitation_logs il WHERE il.round_id = sr.id AND il.email_status = 'sent') as invitations_sent
       FROM survey_rounds sr
       WHERE sr.client_id = ?
       ORDER BY sr.round_number`,
      [clientId]
    );

    // Alert summary
    const alertSummary = await db.get(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE dismissed = FALSE AND COALESCE(solved, FALSE) = FALSE) as active,
        COUNT(*) FILTER (WHERE COALESCE(solved, FALSE) = TRUE) as solved,
        COUNT(*) FILTER (WHERE dismissed = TRUE) as dismissed
       FROM critical_alerts WHERE client_id = ?`,
      [clientId]
    );

    // Engagement warning
    const lastLogin = admins.reduce((latest, a) => {
      if (!a.last_login_at) return latest;
      return !latest || new Date(a.last_login_at) > new Date(latest) ? a.last_login_at : latest;
    }, null);

    const daysSinceLogin = lastLogin
      ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      client,
      subscription,
      admins,
      member_count: memberCount?.count || 0,
      community_count: communityCount?.count || 0,
      test_mode_active: client.test_mode_activated_at != null,
      latest_interview: latestInterview,
      prompt_supplement: promptSupplement?.value || null,
      survey_rounds: surveyRounds,
      alert_summary: {
        total: alertSummary?.total || 0,
        active: alertSummary?.active || 0,
        solved: alertSummary?.solved || 0,
        dismissed: alertSummary?.dismissed || 0,
      },
      engagement: {
        last_login: lastLogin,
        days_since_login: daysSinceLogin,
        warning: daysSinceLogin === null || daysSinceLogin > 30,
      },
      detractor_alert_threshold: detractorSetting ? Number(detractorSetting.value) : 0,
    });
  } catch (err) {
    logger.error({ err }, "Client detail error");
    res.status(500).json({ error: "Failed to load client details" });
  }
});

// Update detractor alert threshold for a client
router.put("/clients/:id/detractor-threshold", async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const { threshold } = req.body;
    const value = Number(threshold) || 0;

    if (value < 0 || value > 10) {
      return res.status(400).json({ error: "Threshold must be between 0 and 10" });
    }

    if (value === 0) {
      // Disable: remove the setting
      await db.run(
        "DELETE FROM settings WHERE key = 'detractor_alert_threshold' AND client_id = ?",
        [clientId]
      );
    } else {
      // Upsert the setting
      await db.run(
        `INSERT INTO settings (key, value, client_id) VALUES ('detractor_alert_threshold', ?, ?)
         ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value`,
        [String(value), clientId]
      );
    }

    logger.info(`Detractor alert threshold for client ${clientId} set to ${value}`);
    res.json({ ok: true, threshold: value });
  } catch (err) {
    logger.error({ err }, "Failed to update detractor threshold");
    res.status(500).json({ error: "Failed to update threshold" });
  }
});

// Get all alerts for a client (all rounds, all statuses)
router.get("/clients/:id/alerts", async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const alerts = await db.all(
      `SELECT ca.*, sr.round_number,
              u.first_name, u.last_name, u.email as user_email,
              COALESCE(cm.community_name, u.community_name) as alert_community
       FROM critical_alerts ca
       LEFT JOIN users u ON u.id = ca.user_id
       LEFT JOIN communities cm ON cm.id = u.community_id
       LEFT JOIN survey_rounds sr ON sr.id = ca.round_id
       WHERE ca.client_id = ?
       ORDER BY ca.created_at DESC`,
      [clientId]
    );
    res.json(alerts);
  } catch (err) {
    logger.error({ err }, "Error fetching client alerts");
    res.status(500).json({ error: err.message });
  }
});

// Get all interviews for a client (version history)
router.get("/clients/:id/interviews", async (req, res) => {
  try {
    const interviews = await db.all(
      `SELECT ai.id, ai.interview_type, ai.status, ai.generated_prompt, ai.interview_summary,
              ai.admin_confirmed, ai.created_at, ai.completed_at,
              ca.email as admin_email, ca.first_name as admin_first_name, ca.last_name as admin_last_name,
              (SELECT COUNT(*) FROM admin_interview_messages aim WHERE aim.interview_id = ai.id) as message_count
       FROM admin_interviews ai
       LEFT JOIN client_admins ca ON ca.id = ai.admin_id
       WHERE ai.client_id = ?
       ORDER BY ai.created_at DESC`,
      [Number(req.params.id)]
    );
    res.json(interviews);
  } catch (err) {
    logger.error({ err }, "Interviews list error");
    res.status(500).json({ error: "Failed to load interviews" });
  }
});

// Get full transcript for an interview
router.get("/clients/:id/interviews/:interviewId/messages", async (req, res) => {
  try {
    const interview = await db.get(
      "SELECT * FROM admin_interviews WHERE id = ? AND client_id = ?",
      [Number(req.params.interviewId), Number(req.params.id)]
    );

    if (!interview) return res.status(404).json({ error: "Interview not found" });

    const messages = await db.all(
      "SELECT id, role, content, created_at FROM admin_interview_messages WHERE interview_id = ? ORDER BY created_at",
      [interview.id]
    );

    res.json({ interview, messages });
  } catch (err) {
    logger.error({ err }, "Interview messages error");
    res.status(500).json({ error: "Failed to load interview messages" });
  }
});

// Activity log for a specific client
router.get("/clients/:id/activity", async (req, res) => {
  try {
    const entries = await db.all(
      "SELECT * FROM activity_log WHERE client_id = ? ORDER BY created_at DESC LIMIT 50",
      [Number(req.params.id)]
    );
    res.json(entries);
  } catch (err) {
    logger.error({ err }, "Client activity error");
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// Reset client (dev/testing) — wipes interviews, prompt, rounds, sessions but keeps board members
router.post("/clients/:id/reset", async (req, res) => {
  const clientId = Number(req.params.id);

  try {
    const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [clientId]);
    if (!client) return res.status(404).json({ error: "Client not found" });

    // Delete order: deepest children first to avoid FK constraint issues
    // (production tables may lack ON DELETE CASCADE)

    // 1. Delete admin interview messages, then interviews
    await db.run(
      "DELETE FROM admin_interview_messages WHERE interview_id IN (SELECT id FROM admin_interviews WHERE client_id = ?)",
      [clientId]
    );
    await db.run("DELETE FROM admin_interviews WHERE client_id = ?", [clientId]);

    // 2. Delete critical alerts FIRST (references messages via source_message_id FK)
    await db.run("DELETE FROM critical_alerts WHERE client_id = ?", [clientId]);

    // 3. Delete messages (child of sessions)
    await db.run(
      "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE client_id = ?)",
      [clientId]
    );

    // 4. Delete invitation logs (references survey_rounds)
    await db.run("DELETE FROM invitation_logs WHERE client_id = ?", [clientId]);

    // 5. Delete sessions (references survey_rounds, communities)
    await db.run("DELETE FROM sessions WHERE client_id = ?", [clientId]);

    // 6. Delete email jobs (references survey_rounds)
    await db.run("DELETE FROM email_jobs WHERE client_id = ?", [clientId]);

    // 7. Delete round-community snapshots (references survey_rounds + communities)
    await db.run(
      "DELETE FROM round_community_snapshots WHERE round_id IN (SELECT id FROM survey_rounds WHERE client_id = ?)",
      [clientId]
    );

    // 8. Delete survey rounds
    await db.run("DELETE FROM survey_rounds WHERE client_id = ?", [clientId]);

    // 8. Delete the prompt supplement setting
    await db.run(
      "DELETE FROM settings WHERE client_id = ? AND key = 'interview_prompt_supplement'",
      [clientId]
    );

    // 9. Unlink board members from communities, then delete communities
    await db.run("UPDATE users SET community_id = NULL WHERE client_id = ?", [clientId]);
    await db.run("DELETE FROM communities WHERE client_id = ?", [clientId]);

    // 10. Reset onboarding_completed on all client admins
    await db.run("UPDATE client_admins SET onboarding_completed = FALSE WHERE client_id = ?", [
      clientId,
    ]);

    // 11. Log the reset
    await db.run(
      "INSERT INTO activity_log (client_id, actor_type, actor_email, action) VALUES (?, 'superadmin', ?, ?)",
      [
        clientId,
        req.session.user?.email || "superadmin",
        `Reset client "${client.company_name}" (interviews, rounds, sessions, communities cleared)`,
      ]
    );

    res.json({
      ok: true,
      message: `Client "${client.company_name}" has been reset. Board members preserved.`,
    });
  } catch (err) {
    logger.error({ err }, "Client reset error");
    res.status(500).json({ error: "Failed to reset client: " + err.message });
  }
});

/**
 * Delete a pending client (abandoned signup cleanup)
 * Only allowed for clients with status = 'pending'
 */
router.delete("/clients/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const client = await db.get("SELECT id, company_name, status FROM clients WHERE id = ?", [id]);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    if (client.status !== "pending") {
      return res.status(400).json({ error: "Only pending clients can be deleted" });
    }

    // Delete all dependent rows explicitly (CASCADE not reliable on all FKs in production)
    await db.run("DELETE FROM sessions WHERE client_id = ?", [id]);
    await db.run("DELETE FROM critical_alerts WHERE client_id = ?", [id]);
    await db.run("DELETE FROM invitation_logs WHERE client_id = ?", [id]);
    await db.run("DELETE FROM admin_interviews WHERE client_id = ?", [id]);
    await db.run("DELETE FROM survey_rounds WHERE client_id = ?", [id]);
    await db.run("DELETE FROM communities WHERE client_id = ?", [id]);
    await db.run("DELETE FROM users WHERE client_id = ?", [id]);
    await db.run("DELETE FROM settings WHERE client_id = ?", [id]);
    await db.run("DELETE FROM client_subscriptions WHERE client_id = ?", [id]);
    await db.run("DELETE FROM client_admins WHERE client_id = ?", [id]);
    await db.run("UPDATE activity_log SET client_id = NULL WHERE client_id = ?", [id]);
    await db.run("DELETE FROM clients WHERE id = ? AND status = 'pending'", [id]);

    // Log with null client_id since client is gone
    await db.run(
      "INSERT INTO activity_log (actor_type, actor_email, action, metadata) VALUES ('superadmin', ?, ?, ?)",
      [
        req.session.user?.email || "superadmin",
        `Deleted pending client "${client.company_name}"`,
        JSON.stringify({ client_id: id, company_name: client.company_name }),
      ]
    );

    logger.info(`Pending client ${id} (${client.company_name}) deleted by superadmin`);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Client delete error");
    res.status(500).json({ error: "Failed to delete client", detail: err.message });
  }
});

// Get board members for a client (for mock survey picker)
router.get("/clients/:id/members", async (req, res) => {
  try {
    const members = await db.all(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              COALESCE(c.community_name, u.community_name) as community_name
       FROM users u
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE u.client_id = ? AND u.active = TRUE
       ORDER BY u.first_name, u.last_name`,
      [Number(req.params.id)]
    );
    res.json(members);
  } catch (err) {
    logger.error({ err }, "Error fetching members for mock survey");
    res.status(500).json({ error: "Failed to load members" });
  }
});

// Create a mock survey session for testing
router.post("/clients/:id/mock-session", async (req, res) => {
  const clientId = Number(req.params.id);
  const { user_id, first_name, email, community_name } = req.body;

  try {
    const client = await db.get("SELECT * FROM clients WHERE id = ?", [clientId]);
    if (!client) return res.status(404).json({ error: "Client not found" });

    let sessionEmail, sessionFirstName, sessionCommunity, sessionUserId, sessionCommunityId;

    if (user_id) {
      // Use an existing board member's identity
      const user = await db.get(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                COALESCE(c.community_name, u.community_name) as community_name,
                u.community_id
         FROM users u
         LEFT JOIN communities c ON c.id = u.community_id
         WHERE u.id = ? AND u.client_id = ?`,
        [user_id, clientId]
      );
      if (!user) return res.status(404).json({ error: "Board member not found" });
      sessionEmail = user.email;
      sessionFirstName = user.first_name;
      sessionCommunity = user.community_name;
      sessionUserId = user.id;
      sessionCommunityId = user.community_id;
    } else {
      // Generic test identity
      sessionEmail = email || "mock-test@residentpulse.local";
      sessionFirstName = first_name || "Test";
      sessionCommunity = community_name || "Test Community";
      sessionUserId = null;
      sessionCommunityId = null;
    }

    const result = await db.run(
      `INSERT INTO sessions (email, user_id, community_name, management_company, client_id, round_id, community_id, is_mock)
       VALUES (?, ?, ?, ?, ?, NULL, ?, TRUE)`,
      [
        sessionEmail,
        sessionUserId,
        sessionCommunity,
        client.company_name,
        clientId,
        sessionCommunityId,
      ]
    );

    const hasLogo = client.logo_base64 ? true : false;

    // Check Google review settings for this client
    const reviewEnabled = await db.get(
      "SELECT value FROM settings WHERE key = 'google_review_enabled' AND client_id = ?",
      [clientId]
    );
    const reviewUrl = await db.get(
      "SELECT value FROM settings WHERE key = 'google_review_url' AND client_id = ?",
      [clientId]
    );
    const googleReviewUrl =
      reviewEnabled?.value === "true" && reviewUrl?.value ? reviewUrl.value : null;

    res.json({
      session_id: result.lastInsertRowid,
      email: sessionEmail,
      first_name: sessionFirstName,
      community: sessionCommunity,
      company: client.company_name,
      client_id: clientId,
      has_logo: hasLogo,
      company_name: client.company_name,
      google_review_url: googleReviewUrl,
    });
  } catch (err) {
    logger.error({ err }, "Error creating mock session");
    res.status(500).json({ error: "Failed to create mock session" });
  }
});

// Get mock sessions for a client
router.get("/clients/:id/mock-sessions", async (req, res) => {
  try {
    const sessions = await db.all(
      `SELECT s.id, s.email, s.nps_score, s.completed, s.summary, s.created_at,
              COALESCE(c.community_name, s.community_name) as community_name,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s
       LEFT JOIN communities c ON c.id = s.community_id
       WHERE s.client_id = ? AND s.is_mock = TRUE
       ORDER BY s.created_at DESC`,
      [Number(req.params.id)]
    );
    res.json(sessions);
  } catch (err) {
    logger.error({ err }, "Error fetching mock sessions");
    res.status(500).json({ error: "Failed to load mock sessions" });
  }
});

export default router;
