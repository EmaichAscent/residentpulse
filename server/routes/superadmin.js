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
    `SELECT c.*, COUNT(ca.id) as admin_count
     FROM clients c
     LEFT JOIN client_admins ca ON ca.client_id = c.id
     GROUP BY c.id
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

export default router;
