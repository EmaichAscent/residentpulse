import { Router } from "express";
import db from "../db.js";
import { notifyCriticalAlert } from "../utils/emailService.js";
import logger from "../utils/logger.js";
import { createMessage } from "../utils/anthropicClient.js";

const router = Router();

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
setInterval(
  () => {
    const cutoff = Date.now() - RATE_WINDOW;
    for (const [key, entry] of rateLimits) {
      if (entry.windowStart < cutoff) rateLimits.delete(key);
    }
  },
  5 * 60 * 1000
);

router.post("/", async (req, res) => {
  const { session_id, message } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: "session_id and message are required" });
  }

  if (!checkRateLimit(session_id)) {
    return res
      .status(429)
      .json({ error: "Too many messages. Please wait a moment before sending another." });
  }

  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [Number(session_id)]);
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Save user message
  await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'user', ?)", [
    Number(session_id),
    message,
  ]);

  // Get conversation history
  const history = await db.all(
    "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    [Number(session_id)]
  );

  // Get system prompt (prefer client-specific, fall back to global)
  const clientSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id = ?",
    [session.client_id]
  );
  const globalSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL"
  );
  let systemPrompt =
    clientSetting?.value || globalSetting?.value || "You are a helpful NPS survey chatbot.";

  // Append interview prompt supplement if the client has one
  const supplement = await db.get(
    "SELECT value FROM settings WHERE key = 'interview_prompt_supplement' AND client_id = ?",
    [session.client_id]
  );
  if (supplement?.value) {
    systemPrompt += "\n\nADDITIONAL CLIENT CONTEXT:\n" + supplement.value;
  }

  // Add community manager context if available — AI should ask about their manager
  if (session.community_id) {
    const communityMgr = await db.get(
      `SELECT c.community_name, c.community_manager_name
       FROM communities c WHERE c.id = ? AND c.community_manager_name IS NOT NULL AND c.community_manager_name != ''`,
      [session.community_id]
    );
    if (communityMgr?.community_manager_name) {
      systemPrompt += `\n\nMANAGER CONTEXT: This board member's community (${communityMgr.community_name}) is managed by ${communityMgr.community_manager_name}. During the conversation, naturally ask how they feel about their community manager's performance, communication, and responsiveness. Use their manager's name to personalize the question. This is important feedback for the management company.`;
    }
  }

  // Google review fast-path for qualifying scores. Threshold is per-client
  // (default 9). When a resident qualifies AND reviews are enabled, the
  // standard 5-7 question budget is replaced with a tight 3-4 turn flow:
  // one quick "what's working" probe, one quick "anything to improve"
  // probe, then the review ask. Promoters are time-poor — get the ask
  // in before they tab away.
  if (session.nps_score !== null && !session.google_review_response) {
    const reviewEnabled = await db.get(
      "SELECT value FROM settings WHERE key = 'google_review_enabled' AND client_id = ?",
      [session.client_id]
    );
    const thresholdSetting = await db.get(
      "SELECT value FROM settings WHERE key = 'google_review_threshold' AND client_id = ?",
      [session.client_id]
    );
    const threshold = thresholdSetting ? Number(thresholdSetting.value) : 9;
    const qualifies = session.nps_score >= threshold;

    if (reviewEnabled?.value === "true" && qualifies) {
      systemPrompt += `\n\nGOOGLE REVIEW PROMOTER FAST-PATH: This resident scored ${session.nps_score}/10 — at or above the ${threshold} threshold for a Google review ask. Promoters abandon chats. Override the standard 5-7 question budget. Run THIS sequence:

  Turn 1  ONE quick "what's working" probe (your post-NPS opener already does this).
  Turn 2  ONE quick "anything they could do even better?" probe.
  Turn 3  The review ask — verbatim or close: "Quick favor — would you be willing to leave a short Google review? It helps us a lot." Then include EXACTLY ONE hidden tag based on their response (system strips before display):
            • If they say yes: [REVIEW:YES]
            • If they decline: [REVIEW:NO]
  Turn 4  Closing reply: "Thank you so much — the link will appear in a moment. Have a great day." then include the [CHAT:END] tag (system strips, auto-closes the chat 3 seconds later).

If they decline the review at Turn 3, your closing reply is: "No problem at all — thanks for your time today." + [CHAT:END]

Do NOT drag this out. Do NOT do a multi-thread sweep. Promoters happily answer briefly; that's enough.`;
    }
  }

  // Check for prior sessions from this user to give the AI context
  // Filter by matching is_test so test sessions only see test history and vice versa
  const priorSessions = await db.all(
    `SELECT s.nps_score, s.summary, s.created_at
     FROM sessions s
     WHERE s.email = ? AND s.id != ? AND s.completed = TRUE AND s.summary IS NOT NULL AND s.client_id = ?
       AND s.is_mock IS NOT TRUE
       AND COALESCE(s.is_test, FALSE) = COALESCE(?, FALSE)
     ORDER BY s.created_at DESC
     LIMIT 5`,
    [session.email, Number(session_id), session.client_id, session.is_test]
  );

  if (priorSessions.length > 0) {
    const priorContext = priorSessions
      .map((p) => {
        const date = new Date(p.created_at).toLocaleDateString();
        return `- ${date} (NPS: ${p.nps_score ?? "N/A"}): ${p.summary}`;
      })
      .join("\n");

    // The system prompt's "Referencing prior context" block governs HOW
    // to use this. Two rules that this block must NOT contradict:
    //   1. NEVER meta-narrate the act of consulting history.
    //      ("I see from your history…", "Looking at your past…" are banned.)
    //   2. Weave prior threads INTO the question itself, one thread at a time.
    // We deliberately avoid the word "acknowledge" here — earlier
    // wording that said "acknowledge their history" trained the model
    // to open with "I see you've been frustrated with X, Y, Z" which
    // is the exact preamble pattern the forbidden-openers list
    // disallows.
    systemPrompt += `\n\nPRIOR SESSION CONTEXT — for your private use, NOT for narration:\nThis resident has completed ${priorSessions.length} prior survey(s) at this client. The summaries below are factual context the resident does not know you have. Use them like a reporter who did their homework — invisibly. Pick at most ONE prior thread per turn and ask about it specifically (e.g. "Last December you mentioned the landscaping vendor wasn't being held accountable — has that improved?"). Never list multiple prior threads in one reply. Never say you "see" or "notice" anything from their history.\n\nPrior session summaries:\n${priorContext}`;
  }

  try {
    const response = await createMessage({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    let assistantMessage = response.content[0].text;

    // [REVIEW:YES|NO] — promoter response to the Google review ask.
    const reviewMatch = assistantMessage.match(/\[REVIEW:\s*(YES|NO)\s*\]/i);
    if (reviewMatch) {
      assistantMessage = assistantMessage.replace(/\s*\[REVIEW:\s*(YES|NO)\s*\]\s*/gi, "").trim();
      const reviewResponse = reviewMatch[1].toLowerCase();
      await db.run("UPDATE sessions SET google_review_response = ? WHERE id = ?", [
        reviewResponse,
        Number(session_id),
      ]);
    }

    // [CHAT:END] — model signals it has wrapped the conversation. The
    // tag is stripped before display; the boolean is returned to the
    // frontend, which renders the closing message and auto-closes the
    // session 3 seconds later. Used by both the standard wrap path
    // and the promoter fast-path's final reply.
    let chatEnd = false;
    if (/\[CHAT:\s*END\s*\]/i.test(assistantMessage)) {
      assistantMessage = assistantMessage.replace(/\s*\[CHAT:\s*END\s*\]\s*/gi, "").trim();
      chatEnd = true;
    }

    // Save assistant message
    await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [
      Number(session_id),
      assistantMessage,
    ]);

    // Get the saved message ID for alert linking
    const savedMsg = await db.get(
      "SELECT id, created_at FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
      [Number(session_id)]
    );

    // Fire critical alert detection asynchronously (skip for mock sessions)
    // Test sessions still run detection (sandbox purpose) but email is suppressed inside
    if (!session.is_mock) {
      detectCriticalAlert(message, session, savedMsg?.id).catch((err) =>
        logger.error("Critical alert detection error: %s", err.message)
      );
    }

    res.json({
      message: assistantMessage,
      timestamp: savedMsg?.created_at,
      chat_end: chatEnd,
    });
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

  const result = await createMessage({
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

  logger.warn(
    `CRITICAL ALERT created for client ${session.client_id}, session ${session.id}: ${parsed.alert_type}`
  );

  // Check if a detractor email will be sent on session complete (to avoid duplicate emails)
  // If so, the critical alert info will be combined into that email instead
  const thresholdSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'detractor_alert_threshold' AND client_id = ?",
    [session.client_id]
  );
  const threshold = thresholdSetting ? Number(thresholdSetting.value) : 0;
  const npsSession = await db.get("SELECT nps_score FROM sessions WHERE id = ?", [session.id]);
  const willSendDetractorEmail =
    threshold > 0 && npsSession?.nps_score !== null && npsSession.nps_score < threshold;

  // Suppress email notifications for test sessions (alert record is still created above)
  if (session.is_test) {
    logger.info(`Skipping critical alert email for test session ${session.id}`);
    return;
  }

  if (willSendDetractorEmail) {
    logger.info(
      `Skipping separate critical alert email for session ${session.id} — will be combined into detractor email`
    );
  } else {
    // Notify admins immediately via standalone critical alert email
    const respondentName =
      [session.first_name, session.last_name].filter(Boolean).join(" ") || "A board member";
    const round = session.round_id
      ? await db.get("SELECT round_number FROM survey_rounds WHERE id = ?", [session.round_id])
      : null;
    notifyCriticalAlert({
      clientId: session.client_id,
      alertType: parsed.alert_type || "other_critical",
      severity: parsed.severity || "high",
      description: parsed.description || "Critical concern detected",
      respondentName,
      communityName: session.community_name || "",
      roundNumber: round?.round_number || null,
      db,
    }).catch((err) => logger.error("Failed to send critical alert notification: %s", err.message));
  }
}

export default router;
