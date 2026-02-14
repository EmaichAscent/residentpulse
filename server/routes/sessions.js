import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";

const router = Router();
const anthropic = new Anthropic();

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

// Check for incomplete session by email
router.get("/incomplete/:email", async (req, res) => {
  const email = req.params.email.trim().toLowerCase();

  // Look up user to get their client_id
  const user = await db.get("SELECT client_id FROM users WHERE LOWER(email) = ?", [email]);
  if (!user) {
    return res.json({ session: null });
  }

  const incompleteSession = await db.get(
    "SELECT * FROM sessions WHERE email = ? AND client_id = ? AND completed = FALSE ORDER BY created_at DESC LIMIT 1",
    [email, user.client_id]
  );
  res.json({ session: incompleteSession || null });
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
  const user = await db.get("SELECT client_id FROM users WHERE LOWER(email) = ?", [cleanEmail]);
  if (!user || !user.client_id) {
    return res.status(400).json({ error: "User not found or not associated with a client" });
  }

  const result = await db.run(
    "INSERT INTO sessions (email, user_id, community_name, management_company, client_id) VALUES (?, ?, ?, ?, ?)",
    [cleanEmail, user_id || null, community_name?.trim() || null, management_company?.trim() || null, user.client_id]
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

async function generateSummary(sessionId) {
  const allMessages = await db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at", [sessionId]);
  const session = await db.get("SELECT nps_score FROM sessions WHERE id = ?", [sessionId]);

  if (allMessages.length === 0) return;

  const transcript = allMessages
    .map((m) => `${m.role === "user" ? "Resident" : "Interviewer"}: ${m.content}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    system: "You are an analyst summarizing resident feedback for a property management company. Write a concise summary (3-5 sentences) highlighting the key themes, concerns, and actionable insights from this NPS interview. Focus on what matters most to management.",
    messages: [
      {
        role: "user",
        content: `NPS Score: ${session?.nps_score ?? "N/A"}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  const summary = response.content[0].text;
  await db.run("UPDATE sessions SET summary = ? WHERE id = ?", [summary, sessionId]);
}

export default router;
