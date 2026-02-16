import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";

const router = Router();
const anthropic = new Anthropic();

router.post("/", async (req, res) => {
  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: "session_id and message are required" });
  }

  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [Number(session_id)]);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Save user message
  await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)", [Number(session_id), message]);

  // Get conversation history
  const history = await db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at", [Number(session_id)]);

  // Get system prompt (prefer client-specific, fall back to global)
  const clientSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id = ?",
    [session.client_id]
  );
  const globalSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL"
  );
  let systemPrompt = clientSetting?.value || globalSetting?.value || "You are a helpful NPS survey chatbot.";

  // Append interview prompt supplement if the client has one
  const supplement = await db.get(
    "SELECT value FROM settings WHERE key = 'interview_prompt_supplement' AND client_id = ?",
    [session.client_id]
  );
  if (supplement?.value) {
    systemPrompt += "\n\nADDITIONAL CLIENT CONTEXT:\n" + supplement.value;
  }

  // Check for prior sessions from this user to give the AI context
  const priorSessions = await db.all(
    `SELECT s.nps_score, s.summary, s.created_at
     FROM sessions s
     WHERE s.email = ? AND s.id != ? AND s.completed = TRUE AND s.summary IS NOT NULL
     ORDER BY s.created_at DESC
     LIMIT 5`,
    [session.email, Number(session_id)]
  );

  if (priorSessions.length > 0) {
    const priorContext = priorSessions
      .map((p) => {
        const date = new Date(p.created_at).toLocaleDateString();
        return `- ${date} (NPS: ${p.nps_score ?? "N/A"}): ${p.summary}`;
      })
      .join("\n");

    systemPrompt += `\n\nIMPORTANT: This is a returning resident. They have completed ${priorSessions.length} prior survey(s). Reference their previous feedback naturally when relevant — acknowledge their history and ask about progress on past concerns. Do NOT repeat the summaries back verbatim; use them to inform your follow-up questions.\n\nPrior session summaries:\n${priorContext}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const assistantMessage = response.content[0].text;

    // Save assistant message
    await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [Number(session_id), assistantMessage]);

    const saved = await db.get("SELECT created_at FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1", [Number(session_id)]);
    res.json({ message: assistantMessage, timestamp: saved?.created_at });
  } catch (err) {
    console.error("Anthropic API error:", err.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

export default router;
