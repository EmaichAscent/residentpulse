import { Router } from "express";
import db from "../db.js";
import { requireSuperAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword } from "../utils/password.js";

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

// Get all clients
router.get("/clients", async (req, res) => {
  const clients = await db.all(
    `SELECT c.*, COUNT(ca.id) as admin_count,
            sp.display_name as plan_name, sp.name as plan_key
     FROM clients c
     LEFT JOIN client_admins ca ON ca.client_id = c.id
     LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     GROUP BY c.id, sp.display_name, sp.name
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
    // Create client
    const clientResult = await db.run(
      "INSERT INTO clients (company_name, address_line1, address_line2, city, state, zip, phone_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [company_name, address_line1 || null, address_line2 || null, city || null, state || null, zip || null, phone_number || null, "active"]
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

  // Update global prompt (client_id = NULL)
  await db.run(
    "INSERT OR REPLACE INTO settings (key, value, client_id) VALUES ('system_prompt', ?, NULL)",
    [prompt]
  );

  res.json({ ok: true });
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
      "SELECT id, email, first_name, last_name, client_id, invitation_token, invitation_token_expires, last_invited_at FROM users WHERE client_id = ?",
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

export default router;
