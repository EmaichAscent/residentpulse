import { Router } from "express";
import db from "../db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword } from "../utils/password.js";
import { generateClientCode } from "../utils/clientCode.js";

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
    console.error("Dashboard error:", err);
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
    console.error("Activity log error:", err);
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
    console.error("Error creating client:", error);
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

  // Store original superadmin session
  req.session.originalUser = req.session.user;

  // Switch to client admin context
  req.session.user = {
    id: admin.id,
    email: admin.email,
    role: "client_admin",
    client_id: client.id,
    company_name: client.company_name,
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

// Update global system prompt
router.put("/prompt", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
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
    console.error("Error saving prompt:", err);
    res.status(500).json({ error: "Failed to save prompt" });
  }
});

// Get all subscription plans
router.get("/plans", async (req, res) => {
  const plans = await db.all("SELECT * FROM subscription_plans ORDER BY sort_order");
  res.json(plans);
});

// Get subscription for a specific client
router.get("/clients/:id/subscription", async (req, res) => {
  const subscription = await db.get(
    `SELECT cs.*, sp.name as plan_name, sp.display_name as plan_display_name,
            sp.member_limit, sp.survey_rounds_per_year
     FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ?`,
    [req.params.id]
  );
  res.json(subscription || null);
});

// Update subscription plan for a client
router.patch("/clients/:id/subscription", async (req, res) => {
  const { plan_id } = req.body;
  const clientId = req.params.id;

  if (!plan_id) {
    return res.status(400).json({ error: "plan_id is required" });
  }

  // Verify plan exists
  const plan = await db.get("SELECT id FROM subscription_plans WHERE id = ?", [plan_id]);
  if (!plan) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  // Check if subscription exists
  const existing = await db.get("SELECT id FROM client_subscriptions WHERE client_id = ?", [clientId]);

  if (existing) {
    await db.run(
      "UPDATE client_subscriptions SET plan_id = ? WHERE client_id = ?",
      [plan_id, clientId]
    );
  } else {
    await db.run(
      "INSERT INTO client_subscriptions (client_id, plan_id, status) VALUES (?, ?, 'active')",
      [clientId, plan_id]
    );
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
    console.error("Diagnostics error:", err);
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
              sp.member_limit, sp.survey_rounds_per_year
       FROM client_subscriptions cs
       JOIN subscription_plans sp ON sp.id = cs.plan_id
       WHERE cs.client_id = ?`,
      [clientId]
    );

    // Admins with last login
    const admins = await db.all(
      "SELECT id, email, created_at, last_login_at, onboarding_completed FROM client_admins WHERE client_id = ?",
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
      engagement: {
        last_login: lastLogin,
        days_since_login: daysSinceLogin,
        warning: daysSinceLogin === null || daysSinceLogin > 30
      }
    });
  } catch (err) {
    console.error("Client detail error:", err);
    res.status(500).json({ error: "Failed to load client details" });
  }
});

// Get all interviews for a client (version history)
router.get("/clients/:id/interviews", async (req, res) => {
  try {
    const interviews = await db.all(
      `SELECT ai.id, ai.interview_type, ai.status, ai.generated_prompt, ai.interview_summary,
              ai.admin_confirmed, ai.created_at, ai.completed_at,
              ca.email as admin_email,
              (SELECT COUNT(*) FROM admin_interview_messages aim WHERE aim.interview_id = ai.id) as message_count
       FROM admin_interviews ai
       LEFT JOIN client_admins ca ON ca.id = ai.admin_id
       WHERE ai.client_id = ?
       ORDER BY ai.created_at DESC`,
      [Number(req.params.id)]
    );
    res.json(interviews);
  } catch (err) {
    console.error("Interviews list error:", err);
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
    console.error("Interview messages error:", err);
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
    console.error("Client activity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// Reset client (dev/testing) — wipes interviews, prompt, rounds, sessions but keeps board members
router.post("/clients/:id/reset", async (req, res) => {
  const clientId = Number(req.params.id);

  try {
    const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [clientId]);
    if (!client) return res.status(404).json({ error: "Client not found" });

    // 1. Delete messages for all sessions belonging to this client
    await db.run(
      "DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE client_id = ?)",
      [clientId]
    );

    // 2. Delete sessions
    await db.run("DELETE FROM sessions WHERE client_id = ?", [clientId]);

    // 3. Delete critical alerts
    await db.run("DELETE FROM critical_alerts WHERE client_id = ?", [clientId]);

    // 4. Delete survey rounds
    await db.run("DELETE FROM survey_rounds WHERE client_id = ?", [clientId]);

    // 5. Delete admin interview messages, then interviews
    await db.run(
      "DELETE FROM admin_interview_messages WHERE interview_id IN (SELECT id FROM admin_interviews WHERE client_id = ?)",
      [clientId]
    );
    await db.run("DELETE FROM admin_interviews WHERE client_id = ?", [clientId]);

    // 6. Delete the prompt supplement setting
    await db.run(
      "DELETE FROM settings WHERE client_id = ? AND key = 'interview_prompt_supplement'",
      [clientId]
    );

    // 7. Reset onboarding_completed on all client admins
    await db.run(
      "UPDATE client_admins SET onboarding_completed = FALSE WHERE client_id = ?",
      [clientId]
    );

    // 8. Log the reset
    await db.run(
      "INSERT INTO activity_log (client_id, actor_email, action) VALUES (?, ?, ?)",
      [clientId, req.session.user?.email || "superadmin", `Reset client "${client.company_name}" (interviews, rounds, sessions cleared)`]
    );

    res.json({ ok: true, message: `Client "${client.company_name}" has been reset. Board members preserved.` });
  } catch (err) {
    console.error("Client reset error:", err);
    res.status(500).json({ error: "Failed to reset client" });
  }
});

export default router;
