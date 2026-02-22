import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { notifyCriticalAlert } from "../utils/emailService.js";
import logger from "../utils/logger.js";

const router = Router();
const anthropic = new Anthropic();

// Rate limiter: 10 requests per minute per session_id
const rateLimits = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(sessionId) {
  const now = Date.now();
  let entry = rateLimits.get(sessionId);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    entry = { windowStart: now, count: 0 };
    rateLimits.set(sessionId, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [key, entry] of rateLimits) {
    if (entry.windowStart < cutoff) rateLimits.delete(key);
  }
}, 5 * 60 * 1000);

router.post("/", async (req, res) => {
  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: "session_id and message are required" });
  }

  if (!checkRateLimit(session_id)) {
    return res.status(429).json({ error: "Too many messages. Please wait a moment before sending another." });
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
     WHERE s.email = ? AND s.id != ? AND s.completed = TRUE AND s.summary IS NOT NULL AND s.client_id = ?
     ORDER BY s.created_at DESC
     LIMIT 5`,
    [session.email, Number(session_id), session.client_id]
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

    // Get the saved message ID for alert linking
    const savedMsg = await db.get(
      "SELECT id, created_at FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
      [Number(session_id)]
    );

    // Fire critical alert detection asynchronously (don't block the response)
    detectCriticalAlert(message, session, savedMsg?.id).catch((err) =>
      logger.error("Critical alert detection error: %s", err.message)
    );

    res.json({ message: assistantMessage, timestamp: savedMsg?.created_at });
  } catch (err) {
    logger.error("Anthropic API error: %s", err.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

/**
 * Async critical alert detection — analyzes the board member's message
 * for time-sensitive concerns (contract termination, legal threats, safety).
 * Uses Haiku for speed. High threshold to avoid false positives.
 */
async function detectCriticalAlert(userMessage, session, messageId) {
  // Skip short messages unlikely to contain actionable concerns
  if (userMessage.length < 30) return;

  const result = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `You are a critical alert detector for a property management NPS survey platform. Analyze the board member's message for URGENT, TIME-SENSITIVE concerns that require immediate management company attention.

ONLY flag messages that contain:
- Explicit intent to terminate/replace the management company (not just frustration)
- Threats of legal action BY THE BOARD MEMBER against the management company or community association — someone saying they personally plan to sue or hire an attorney to take action against management
- Safety emergencies or hazardous conditions
- Other issues requiring immediate intervention

DO NOT flag:
- General complaints, low satisfaction, frustration, venting, or suggestions for improvement
- Routine community legal matters: hiring attorneys for delinquencies/collections, covenant enforcement, lien filings, or any standard HOA legal process
- Mentions of attorneys or legal processes that are normal community business, not directed as threats against the management company
- Anything that can wait for a normal report

Respond with JSON only:
{"is_critical": false}
or
{"is_critical": true, "alert_type": "contract_termination|legal_threat|safety_concern|other_critical", "severity": "high|critical", "description": "Brief 1-sentence description of the concern"}`,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = result.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // If JSON parsing fails, try to extract from markdown code block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else return;
  }

  if (!parsed.is_critical) return;

  await db.run(
    `INSERT INTO critical_alerts (client_id, round_id, session_id, user_id, alert_type, severity, description, source_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.client_id,
      session.round_id || null,
      session.id,
      session.user_id || null,
      parsed.alert_type || "other_critical",
      parsed.severity || "high",
      parsed.description || "Critical concern detected in board member response",
      messageId || null,
    ]
  );

  logger.warn(`CRITICAL ALERT created for client ${session.client_id}, session ${session.id}: ${parsed.alert_type}`);

  // Notify admins immediately
  const respondentName = [session.first_name, session.last_name].filter(Boolean).join(" ") || "A board member";
  const round = session.round_id ? await db.get("SELECT round_number FROM survey_rounds WHERE id = ?", [session.round_id]) : null;
  notifyCriticalAlert({
    clientId: session.client_id,
    alertType: parsed.alert_type || "other_critical",
    severity: parsed.severity || "high",
    description: parsed.description || "Critical concern detected",
    respondentName,
    communityName: session.community_name || "",
    roundNumber: round?.round_number || null,
    db,
  }).catch(err => logger.error("Failed to send critical alert notification: %s", err.message));
}

export default router;
