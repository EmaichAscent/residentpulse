import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword } from "../utils/password.js";
import { generateClientCode } from "../utils/clientCode.js";
import logger from "../utils/logger.js";

const anthropic = new Anthropic();

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
    user: req.session.user
  });
});

// All other SuperAdmin routes require authentication
router.use(requireSuperAdmin);

// Dashboard aggregate stats
router.get("/dashboard", async (req, res) => {
  try {
    const totalClients = await db.get("SELECT COUNT(*) as count FROM clients");
    const activeClients = await db.get("SELECT COUNT(*) as count FROM clients WHERE status = 'active'");
    const activeRounds = await db.get("SELECT COUNT(*) as count FROM survey_rounds WHERE status = 'in_progress'");
    const totalResponses = await db.get("SELECT COUNT(*) as count FROM sessions WHERE completed = TRUE");
    const totalMembers = await db.get("SELECT COUNT(*) as count FROM users WHERE active = TRUE");

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
      engagement_warnings: warnings
    });
  } catch (err) {
    logger.error({ err }, "Dashboard error");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// Activity log (paginated)
router.get("/activity-log", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const entries = await db.all(
      `SELECT al.*, c.company_name
       FROM activity_log al
       LEFT JOIN clients c ON c.id = al.client_id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const total = await db.get("SELECT COUNT(*) as count FROM activity_log");

    res.json({
      entries,
      total: total?.count || 0,
      page,
      limit
    });
  } catch (err) {
    logger.error({ err }, "Activity log error");
    res.status(500).json({ error: "Failed to load activity log" });
  }
});

// Get all clients (simplified for list view)
router.get("/clients", async (req, res) => {
  const clients = await db.all(
    `SELECT c.id, c.company_name, c.client_code, c.status, c.created_at,
            sp.display_name as plan_name, sp.name as plan_key,
            MAX(ca.last_login_at) as last_activity,
            COUNT(ca.id) as admin_count
     FROM clients c
     LEFT JOIN client_admins ca ON ca.client_id = c.id
     LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     GROUP BY c.id, c.company_name, c.client_code, c.status, c.created_at, sp.display_name, sp.name
     ORDER BY c.created_at DESC`
  );
  res.json(clients);
});

// Create new client
router.post("/clients", async (req, res) => {
  const { company_name, address_line1, address_line2, city, state, zip, phone_number, admin_email } = req.body;

  if (!company_name || !admin_email) {
    return res.status(400).json({ error: "Company name and admin email are required" });
  }

  // Check if admin email already exists
  const existingAdmin = await db.get("SELECT id FROM client_admins WHERE email = ?", [admin_email.toLowerCase().trim()]);
  if (existingAdmin) {
    return res.status(400).json({ error: "An admin with this email already exists" });
  }

  try {
    // Create client with unique code
    const clientCode = await generateClientCode();
    const clientResult = await db.run(
      "INSERT INTO clients (company_name, address_line1, address_line2, city, state, zip, phone_number, status, client_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [company_name, address_line1 || null, address_line2 || null, city || null, state || null, zip || null, phone_number || null, "active", clientCode]
    );
    const clientId = clientResult.lastInsertRowid;

    // Generate temporary password
    const tempPassword = generatePassword(16);
    const passwordHash = await hashPassword(tempPassword);

    // Create first admin user for this client
    await db.run(
      "INSERT INTO client_admins (client_id, email, password_hash) VALUES (?, ?, ?)",
      [clientId, admin_email.toLowerCase().trim(), passwordHash]
    );

    // Copy system prompt to this client
    const globalPrompt = await db.get("SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL");
    if (globalPrompt) {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES ('system_prompt', ?, ?)",
        [globalPrompt.value, clientId]
      );
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
      message: "Client created successfully. Share these credentials with the client admin."
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
    [company_name, address_line1 || null, address_line2 || null, city || null, state || null, zip || null, phone_number || null, id]
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

  await db.run(
    "UPDATE clients SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [status, id]
  );

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
    impersonating: true
  };

  res.json({
    ok: true,
    user: req.session.user
  });
});

// Get global system prompt
router.get("/prompt", async (req, res) => {
  const setting = await db.get("SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL");
  res.json({ prompt: setting?.value || "" });
});

// Update global system prompt (auto-saves previous version)
router.put("/prompt", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // Auto-save the current live prompt as a version before overwriting
    const current = await db.get("SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL");
    if (current?.value && current.value !== prompt) {
      await db.run(
        "INSERT INTO prompt_versions (prompt_text, label, created_by) VALUES (?, ?, ?)",
        [current.value, "Auto-save", req.session.user?.email || "unknown"]
      );
    }

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
    const initial = await db.get("SELECT value FROM settings WHERE key = 'interview_initial_prompt' AND client_id IS NULL");
    const re = await db.get("SELECT value FROM settings WHERE key = 'interview_re_prompt' AND client_id IS NULL");
    const generation = await db.get("SELECT value FROM settings WHERE key = 'prompt_generation_instruction' AND client_id IS NULL");
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

// Update an interview prompt
router.put("/interview-prompts", async (req, res) => {
  const { key, value } = req.body;
  const validKeys = ["interview_initial_prompt", "interview_re_prompt", "prompt_generation_instruction"];

  if (!validKeys.includes(key)) {
    return res.status(400).json({ error: "Invalid prompt key" });
  }

  if (!value) {
    return res.status(400).json({ error: "Prompt value is required" });
  }

  try {
    const result = await db.run(
      "UPDATE settings SET value = ? WHERE key = ? AND client_id IS NULL",
      [value, key]
    );
    if (!result.changes) {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL)",
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error saving interview prompt");
    res.status(500).json({ error: "Failed to save interview prompt" });
  }
});

// Get saved prompt versions
router.get("/prompt/versions", async (req, res) => {
  try {
    const versions = await db.all("SELECT * FROM prompt_versions ORDER BY created_at DESC");
    res.json(versions);
  } catch (err) {
    logger.error({ err }, "Error loading prompt versions");
    res.status(500).json({ error: "Failed to load versions" });
  }
});

// Save current prompt as a named version
router.post("/prompt/versions", async (req, res) => {
  const { prompt_text, label } = req.body;

  if (!prompt_text) {
    return res.status(400).json({ error: "prompt_text is required" });
  }

  try {
    const result = await db.run(
      "INSERT INTO prompt_versions (prompt_text, label, created_by) VALUES (?, ?, ?)",
      [prompt_text, label || "Saved version", req.session.user?.email || "unknown"]
    );
    const version = await db.get("SELECT * FROM prompt_versions WHERE id = ?", [result.lastInsertRowid]);
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

// AI Prompt Assistant — Claude refines the prompt based on instructions
router.post("/prompt/assistant", async (req, res) => {
  const { current_prompt, instructions } = req.body;

  if (!instructions) {
    return res.status(400).json({ error: "Instructions are required" });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: "You are an expert prompt engineer. The user has an existing AI system prompt that is used to conduct NPS (Net Promoter Score) surveys with HOA board members via conversational AI. They want you to improve or modify it based on their instructions. Return ONLY the full updated prompt text with no preamble, explanation, or commentary. Do not wrap it in code blocks or quotes.",
      messages: [
        {
          role: "user",
          content: current_prompt
            ? `Here is the current system prompt:\n\n${current_prompt}\n\nPlease make the following changes:\n${instructions}`
            : `Please create a system prompt for an AI that conducts NPS surveys with HOA board members. Here are the requirements:\n${instructions}`
        }
      ]
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
  const { name, display_name, member_limit, survey_rounds_per_year, price_cents, is_public, sort_order, zoho_plan_code } = req.body;

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
      [name, display_name, member_limit || 0, survey_rounds_per_year || 2, price_cents ?? null, is_public ?? true, sort_order || 0, zoho_plan_code || null]
    );
    const plan = await db.get("SELECT * FROM subscription_plans WHERE id = ?", [result.lastInsertRowid]);
    res.json(plan);
  } catch (err) {
    logger.error({ err }, "Error creating plan");
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// Update a subscription plan
router.put("/plans/:id", async (req, res) => {
  const { display_name, member_limit, survey_rounds_per_year, price_cents, is_public, sort_order, zoho_plan_code } = req.body;

  if (!display_name) {
    return res.status(400).json({ error: "display_name is required" });
  }

  try {
    await db.run(
      `UPDATE subscription_plans SET display_name = ?, member_limit = ?, survey_rounds_per_year = ?, price_cents = ?, is_public = ?, sort_order = ?, zoho_plan_code = ?
       WHERE id = ?`,
      [display_name, member_limit || 0, survey_rounds_per_year || 2, price_cents ?? null, is_public ?? true, sort_order || 0, zoho_plan_code || null, req.params.id]
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

  const usage = await db.get("SELECT COUNT(*) as count FROM client_subscriptions WHERE plan_id = ?", [req.params.id]);
  if (usage?.count > 0) {
    return res.status(400).json({ error: `Cannot delete — ${usage.count} client(s) are on this plan` });
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
  const existing = await db.get("SELECT id FROM client_subscriptions WHERE client_id = ?", [clientId]);

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
        await db.run(
          "INSERT INTO communities (client_id, community_name) VALUES (?, ?)",
          [clientId, row.community_name.trim()]
        );
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
    const userEmails = users.map(u => u.email);
    let sessionsByEmail = [];
    if (userEmails.length > 0) {
      const placeholders = userEmails.map((_, i) => `$${i + 1}`).join(", ");
      const result = await db.pool.query(
        `SELECT id, email, client_id, user_id, round_id, nps_score, completed, created_at, summary FROM sessions WHERE LOWER(email) IN (${placeholders})`,
        userEmails.map(e => e.toLowerCase())
      );
      sessionsByEmail = result.rows;
    }

    // 5. Sessions with NULL client_id (orphaned)
    const orphanedSessions = await db.all(
      "SELECT id, email, client_id, user_id, round_id, nps_score, completed, created_at FROM sessions WHERE client_id IS NULL"
    );

    // 6. Survey rounds for this client
    const surveyRounds = await db.all(
      "SELECT * FROM survey_rounds WHERE client_id = ?",
      [clientId]
    );

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
      invitation_logs: invitationLogs
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

  await db.run(
    "UPDATE sessions SET client_id = ?, round_id = ? WHERE id = ?",
    [client_id, round_id || null, sessionId]
  );

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
    const memberCount = await db.get("SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE", [clientId]);
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

    // Survey rounds
    const surveyRounds = await db.all(
      `SELECT sr.*,
              (SELECT COUNT(*) FROM sessions s WHERE s.round_id = sr.id AND s.completed = true) as responses_completed,
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
      latest_interview: latestInterview,
      prompt_supplement: promptSupplement?.value || null,
      survey_rounds: surveyRounds,
      alert_summary: {
        total: alertSummary?.total || 0,
        active: alertSummary?.active || 0,
        solved: alertSummary?.solved || 0,
        dismissed: alertSummary?.dismissed || 0
      },
      engagement: {
        last_login: lastLogin,
        days_since_login: daysSinceLogin,
        warning: daysSinceLogin === null || daysSinceLogin > 30
      }
    });
  } catch (err) {
    logger.error({ err }, "Client detail error");
    res.status(500).json({ error: "Failed to load client details" });
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

    // 2. Delete messages (child of sessions)
    await db.run(
      "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE client_id = ?)",
      [clientId]
    );

    // 3. Delete critical alerts (references sessions, messages, survey_rounds)
    await db.run("DELETE FROM critical_alerts WHERE client_id = ?", [clientId]);

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
    await db.run(
      "UPDATE client_admins SET onboarding_completed = FALSE WHERE client_id = ?",
      [clientId]
    );

    // 11. Log the reset
    await db.run(
      "INSERT INTO activity_log (client_id, actor_type, actor_email, action) VALUES (?, 'superadmin', ?, ?)",
      [clientId, req.session.user?.email || "superadmin", `Reset client "${client.company_name}" (interviews, rounds, sessions, communities cleared)`]
    );

    res.json({ ok: true, message: `Client "${client.company_name}" has been reset. Board members preserved.` });
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
      [req.session.user?.email || "superadmin", `Deleted pending client "${client.company_name}"`, JSON.stringify({ client_id: id, company_name: client.company_name })]
    );

    logger.info(`Pending client ${id} (${client.company_name}) deleted by superadmin`);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Client delete error");
    res.status(500).json({ error: "Failed to delete client", detail: err.message });
  }
});

export default router;
