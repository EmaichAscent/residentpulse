import { Router } from "express";
import db from "../db.js";
import { generateSummary } from "../utils/summaryGenerator.js";

const router = Router();

// Get session details including messages
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [id]);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const messages = await db.all(
    "SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at",
    [id]
  );

  res.json({ session, messages });
});

// Validate invitation token and return user data (public endpoint)
router.get("/validate-token/:token", async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    // Look up user by invitation token (join communities for canonical name)
    const user = await db.get(
      `SELECT u.id, u.email, u.first_name, u.last_name,
              COALESCE(c.community_name, u.community_name) as community_name,
              u.management_company, u.client_id, u.invitation_token_expires
       FROM users u
       LEFT JOIN communities c ON c.id = u.community_id
       WHERE u.invitation_token = ?`,
      [token]
    );

    if (!user) {
      return res.status(404).json({ error: "Invalid invitation token" });
    }

    // Check if token has expired
    const expiryDate = new Date(user.invitation_token_expires);
    const now = new Date();

    if (expiryDate < now) {
      return res.status(404).json({ error: "Invitation token has expired" });
    }

    // Check if user's client has survey rounds and if one is still active
    const hasRounds = await db.get(
      "SELECT id FROM survey_rounds WHERE client_id = ? LIMIT 1",
      [user.client_id]
    );

    if (hasRounds) {
      const activeRound = await db.get(
        "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'in_progress'",
        [user.client_id]
      );
      if (!activeRound) {
        return res.status(404).json({ error: "This survey round has concluded." });
      }
    }

    // Return user data (without sensitive info)
    res.json({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      community_name: user.community_name,
      management_company: user.management_company,
      user_id: user.id,
      client_id: user.client_id
    });

  } catch (err) {
    console.error("Token validation error:", err);
    res.status(500).json({ error: "Failed to validate token" });
  }
});

// Delete a session
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  // Delete messages first
  await db.run("DELETE FROM messages WHERE session_id = ?", [id]);
  // Then delete session
  await db.run("DELETE FROM sessions WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Create a new session for a given email
router.post("/", async (req, res) => {
  const { email, user_id, community_name, management_company } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Look up user to get their client_id
  // Prefer user_id lookup (from token validation) to avoid ambiguity when
  // the same email exists as a board member under multiple clients
  let user;
  if (user_id) {
    user = await db.get("SELECT client_id FROM users WHERE id = ?", [user_id]);
  }
  if (!user) {
    user = await db.get("SELECT client_id FROM users WHERE LOWER(email) = ?", [cleanEmail]);
  }
  if (!user || !user.client_id) {
    return res.status(400).json({ error: "User not found or not associated with a client" });
  }

  // Look up active round for this client (if any)
  const activeRound = await db.get(
    "SELECT id FROM survey_rounds WHERE client_id = ? AND status = 'in_progress'",
    [user.client_id]
  );

  const result = await db.run(
    "INSERT INTO sessions (email, user_id, community_name, management_company, client_id, round_id) VALUES (?, ?, ?, ?, ?, ?)",
    [cleanEmail, user_id || null, community_name?.trim() || null, management_company?.trim() || null, user.client_id, activeRound?.id || null]
  );
  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [result.lastInsertRowid]);
  res.json(session);
});

// Update NPS score for a session
router.patch("/:id/nps", async (req, res) => {
  const { nps_score } = req.body;
  const { id } = req.params;

  if (nps_score === undefined || nps_score < 0 || nps_score > 10) {
    return res.status(400).json({ error: "NPS score must be between 0 and 10" });
  }

  await db.run("UPDATE sessions SET nps_score = ? WHERE id = ?", [nps_score, Number(id)]);
  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [Number(id)]);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Mark session complete and generate summary
router.patch("/:id/complete", async (req, res) => {
  const id = Number(req.params.id);
  await db.run("UPDATE sessions SET completed = TRUE WHERE id = ?", [id]);
  res.json({ ok: true });

  // Generate summary asynchronously (don't block the response)
  generateSummary(id).catch((err) =>
    console.error("Summary generation failed:", err.message)
  );
});

export default router;
