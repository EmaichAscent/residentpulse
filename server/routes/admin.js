import { Router } from "express";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { hashPassword, generatePassword } from "../utils/password.js";

const router = Router();

// All admin routes require client admin authentication
router.use(requireClientAdmin);

// Get all sessions with message count (filtered by client)
router.get("/responses", async (req, res) => {
  const sessions = await db.all(
    `SELECT s.*, COUNT(m.id) as message_count
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     WHERE s.client_id = ?
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [req.clientId]
  );
  res.json(sessions);
});

// Get messages for a session (with tenant validation)
router.get("/responses/:id/messages", async (req, res) => {
  const id = Number(req.params.id);

  // Verify session belongs to this client
  const session = await db.get("SELECT id FROM sessions WHERE id = ? AND client_id = ?", [id, req.clientId]);
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
  const session = await db.get("SELECT id FROM sessions WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  await db.run("DELETE FROM messages WHERE session_id = ?", [id]);
  await db.run("DELETE FROM sessions WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Get client account information
router.get("/account", async (req, res) => {
  const client = await db.get("SELECT * FROM clients WHERE id = ?", [req.clientId]);

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  res.json(client);
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

// Get board members (users table) for current client
router.get("/board-members", async (req, res) => {
  const users = await db.all(
    "SELECT id, first_name, last_name, email, community_name, management_company, updated_at FROM users WHERE client_id = ? ORDER BY email",
    [req.clientId]
  );
  res.json(users);
});

// Add board member
router.post("/board-members", async (req, res) => {
  const { email, first_name, last_name, community_name, management_company } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if email already exists for this client
  const existing = await db.get("SELECT id FROM users WHERE email = ? AND client_id = ?", [cleanEmail, req.clientId]);
  if (existing) {
    return res.status(400).json({ error: "A board member with this email already exists" });
  }

  const result = await db.run(
    "INSERT INTO users (client_id, email, first_name, last_name, community_name, management_company) VALUES (?, ?, ?, ?, ?, ?)",
    [req.clientId, cleanEmail, first_name || null, last_name || null, community_name || null, management_company || null]
  );

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
  const user = await db.get("SELECT id FROM users WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!user) {
    return res.status(404).json({ error: "Board member not found" });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if email is already used by another user
  const existing = await db.get("SELECT id FROM users WHERE email = ? AND client_id = ? AND id != ?", [cleanEmail, req.clientId, id]);
  if (existing) {
    return res.status(400).json({ error: "A board member with this email already exists" });
  }

  await db.run(
    "UPDATE users SET email = ?, first_name = ?, last_name = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [cleanEmail, first_name || null, last_name || null, community_name || null, management_company || null, id]
  );

  const updatedUser = await db.get("SELECT * FROM users WHERE id = ?", [id]);
  res.json(updatedUser);
});

// Delete board member
router.delete("/board-members/:id", async (req, res) => {
  const { id } = req.params;

  // Verify the user belongs to this client
  const user = await db.get("SELECT id FROM users WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!user) {
    return res.status(404).json({ error: "Board member not found" });
  }

  await db.run("DELETE FROM users WHERE id = ?", [id]);
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
        const existing = await db.get("SELECT id FROM users WHERE email = ? AND client_id = ?", [email, req.clientId]);

        if (existing) {
          await db.run(
            "UPDATE users SET first_name = ?, last_name = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [first_name, last_name, community_name, management_company, existing.id]
          );
          updated++;
        } else {
          await db.run(
            "INSERT INTO users (client_id, email, first_name, last_name, community_name, management_company) VALUES (?, ?, ?, ?, ?, ?)",
            [req.clientId, email, first_name, last_name, community_name, management_company]
          );
          created++;
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

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

// Get admin users for current client
router.get("/users", async (req, res) => {
  const users = await db.all(
    "SELECT id, email, created_at FROM client_admins WHERE client_id = ? ORDER BY created_at",
    [req.clientId]
  );
  res.json(users);
});

// Add admin user to current client
router.post("/users", async (req, res) => {
  const { email } = req.body;

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

  // Create admin user
  await db.run(
    "INSERT INTO client_admins (client_id, email, password_hash) VALUES (?, ?, ?)",
    [req.clientId, cleanEmail, passwordHash]
  );

  res.json({
    ok: true,
    email: cleanEmail,
    temp_password: tempPassword,
    message: "Admin user created successfully. Share these credentials with the new admin."
  });
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

export default router;
