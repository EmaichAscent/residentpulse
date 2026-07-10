import { Router } from "express";
import db from "../db.js";
import { notifyCriticalAlert } from "../utils/emailService.js";
import logger from "../utils/logger.js";
// `createMessage` is the AI provider router — dispatches to Anthropic
// or xAI based on the global `ai_provider` setting. The critical-alert
// detector below stays on `anthropicCreateMessage` directly because
// it's a fast classifier; we don't want to swap that for testing.
import { createMessage } from "../utils/aiRouter.js";
import { createMessage as anthropicCreateMessage } from "../utils/anthropicClient.js";
import {
  getTemplateConfig,
  recordAnswer,
  emitWidgetMessage,
  answeredQuestionIds,
  getUnansweredRequired,
  baselineIntro,
  buildWeaveInAddendum,
  selectContextualForSession,
} from "../utils/surveyRuntime.js";
// Programmatic close flow — server-side state machine that takes the
// closing wrap-up out of the model's hands. V3.0 prompt engineering
// plateaued (both Grok and Claude consistently violate the closing
// rules) so the server now (a) decides when to close, (b) emits a
// scoped-LLM playback message, then (c) emits a templated final
// close with [CHAT:END] — no model involvement on the final step.
import {
  CLOSE_PHASE,
  shouldFirePlayback,
  generatePlayback,
  generateFinalClose,
  stripChatEndTag,
  logPhaseTransition,
} from "../utils/closeFlow.js";

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

  // ── Widget gate (hybrid survey, Phase D1) ───────────────────────
  // While a required widget is unanswered, the chat accepts only an
  // answer/skip via POST /api/chat/answer — not free text. The client
  // locks the composer too; this is the server-side guarantee.
  if (session.pending_question_id) {
    return res.status(409).json({
      error: "answer_required",
      pending_question_id: session.pending_question_id,
    });
  }

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

  // ── Programmatic close-flow gate ────────────────────────────────
  // Runs BEFORE the normal system-prompt build + AI call so the model
  // never gets a chance to mangle the close. Three branches:
  //
  //   close_phase = 'awaiting_playback_response':
  //     The user just answered the playback question. Emit the
  //     templated final close (no model call), flip to 'done',
  //     return with chat_end=true.
  //
  //   close_phase = 'interview' AND shouldFirePlayback():
  //     Server has decided it's time to wrap up. Generate the
  //     scoped-LLM playback, save it as the assistant message, flip
  //     to 'awaiting_playback_response', return.
  //
  //   close_phase = 'interview' AND not yet time to close:
  //     Fall through to normal interview-question generation below.
  //
  //   close_phase = 'done':
  //     Session has already closed. Refuse the request — frontend
  //     should have auto-closed the chat after [CHAT:END] fired.
  if (session.close_phase === CLOSE_PHASE.DONE) {
    return res.status(409).json({ error: "This chat has already been closed." });
  }

  if (session.close_phase === CLOSE_PHASE.AWAITING_PLAYBACK_RESPONSE) {
    try {
      const clientRow = await db.get("SELECT company_name FROM clients WHERE id = ?", [
        session.client_id,
      ]);
      const clientName = clientRow?.company_name || "your management company";
      const conversationText = history.map((m) => m.content || "").join(" ");

      const finalCloseMessage = generateFinalClose({ clientName, conversationText });

      await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [
        Number(session_id),
        finalCloseMessage,
      ]);
      await db.run("UPDATE sessions SET close_phase = ? WHERE id = ?", [
        CLOSE_PHASE.DONE,
        Number(session_id),
      ]);
      logPhaseTransition({
        sessionId: Number(session_id),
        from: CLOSE_PHASE.AWAITING_PLAYBACK_RESPONSE,
        to: CLOSE_PHASE.DONE,
        reason: "user responded to playback",
      });

      // Frontend strips [CHAT:END] from the visible message and uses
      // chat_end=true to auto-close the session 3 seconds later.
      const display = stripChatEndTag(finalCloseMessage);
      const savedMsg = await db.get(
        "SELECT created_at FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1",
        [Number(session_id)]
      );
      return res.json({ message: display, timestamp: savedMsg?.created_at, chat_end: true });
    } catch (err) {
      logger.error("Programmatic final close failed: %s", err.message);
      return res.status(500).json({ error: "Failed to close chat" });
    }
  }

  // Phase = 'interview'. Decide whether this turn is a normal question
  // or whether the server should now start the wrap-up.
  const aiMessageCount = history.filter((m) => m.role === "assistant").length;
  if (shouldFirePlayback({ aiMessageCount, userMessage: message })) {
    try {
      // Hybrid survey (Phase D2): before the playback, deliver any
      // REQUIRED questions the conversation never got to. The server
      // walks them one gated widget at a time; POST /answer emits the
      // next widget (or the playback) after each answer.
      if (session.template_version_id) {
        const config = await getTemplateConfig(session.template_version_id);
        const answered = await answeredQuestionIds(Number(session_id));
        const remaining = getUnansweredRequired(config, answered);
        if (remaining.length > 0) {
          const first = remaining[0];
          const { content, payload } = await emitWidgetMessage(session, first, {
            gate: true,
            phrasingOverride: baselineIntro(remaining.length, first),
          });
          await db.run("UPDATE sessions SET close_phase = ? WHERE id = ?", [
            CLOSE_PHASE.BASELINE_BATCH,
            Number(session_id),
          ]);
          logPhaseTransition({
            sessionId: Number(session_id),
            from: CLOSE_PHASE.INTERVIEW,
            to: CLOSE_PHASE.BASELINE_BATCH,
            reason: `${remaining.length} required question(s) unanswered at close`,
          });

          if (!session.is_mock) {
            const userMsgRow = await db.get(
              "SELECT id FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
              [Number(session_id)]
            );
            detectCriticalAlert(message, session, userMsgRow?.id).catch((err) =>
              logger.error("Critical alert detection error: %s", err.message)
            );
          }

          return res.json({
            message: content,
            message_type: "widget",
            widget_payload: payload,
            chat_end: false,
          });
        }
      }

      const { playback, timestamp } = await firePlayback(
        session,
        `aiMessageCount=${aiMessageCount}`
      );

      // Fire critical alert detection on the user message that
      // triggered the playback (skip for mock sessions).
      if (!session.is_mock) {
        const userMsgRow = await db.get(
          "SELECT id FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
          [Number(session_id)]
        );
        detectCriticalAlert(message, session, userMsgRow?.id).catch((err) =>
          logger.error("Critical alert detection error: %s", err.message)
        );
      }

      return res.json({ message: playback, timestamp, chat_end: false });
    } catch (err) {
      logger.error("Programmatic playback generation failed: %s", err.message);
      // Fall through — if the playback call breaks, let the regular
      // interview path try a normal AI reply rather than 500 the
      // resident's chat.
    }
  }

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

  // Hybrid survey weave-in (Phase D2): teach the model the [ASK:code]
  // signal for required questions still unanswered. The model only
  // nominates the moment; the server emits the actual widget. Anything
  // never woven in is guaranteed by the baseline batch at close.
  let templateConfig = null;
  let unansweredRequired = [];
  if (session.template_version_id) {
    templateConfig = await getTemplateConfig(session.template_version_id);
    const answered = await answeredQuestionIds(Number(session_id));
    unansweredRequired = getUnansweredRequired(templateConfig, answered);
    systemPrompt += buildWeaveInAddendum(unansweredRequired);
  }

  try {
    // Contextual nomination (Phase D3) runs CONCURRENTLY with the
    // interview reply — the Haiku trigger classifier finishes well
    // inside the reply's latency envelope, so contextual widgets add
    // no wall-clock cost. The classifier only nominates; selection
    // (one per turn, template order, NPS band, per-session cap, no
    // repeats) is decided in code (surveyRuntime.js).
    const contextualPromise = templateConfig
      ? selectContextualForSession(session, templateConfig, message).catch((err) => {
          logger.warn({ err }, "Contextual nomination failed — turn continues without it");
          return null;
        })
      : Promise.resolve(null);

    // V3.0 ship — switched from claude-haiku-4-5-20251001 to Sonnet 4.5
    // for the main board-interview reply. Haiku consistently failed to
    // follow the V2.x prompt's long Never list (sycophantic openers,
    // re-opening closed topics, drilling past 3 questions). Sonnet
    // tracks long instruction lists better. Cost delta is small now
    // that V3.0 is ~5× shorter than V2.8.
    //
    // The async critical-alert detector below stays on Haiku — it's a
    // simple classification call, doesn't need Sonnet's reasoning.
    const response = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    let assistantMessage = response.content[0].text;

    // [ASK:code] — the model nominated a natural moment for a required
    // structured question (weave-in, Phase D2). Strip the tag; if the
    // code is a valid unanswered required question, emit the real
    // widget (gated) right after this reply.
    let weaveInQuestion = null;
    const askMatch = assistantMessage.match(/\[ASK:\s*([A-Za-z0-9]+)\s*\]/);
    if (askMatch) {
      assistantMessage = assistantMessage.replace(/\s*\[ASK:\s*[A-Za-z0-9]+\s*\]\s*/g, " ").trim();
      const code = askMatch[1].toUpperCase();
      weaveInQuestion = unansweredRequired.find((q) => q.code === code) || null;
      if (!weaveInQuestion) {
        logger.warn(
          { session_id: Number(session_id), code },
          "Stripped [ASK] tag for unknown/answered/non-required question"
        );
      }
    }

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

    // [CHAT:END] handling. The Google review fast-path is the ONLY
    // remaining model-driven close — when a promoter scored at/above
    // threshold and the review prompt fires, the model can legitimately
    // emit [CHAT:END] on its final reply. For all other interviews,
    // the close is now server-driven (closeFlow.js + the gate above
    // this block), so any model-emitted [CHAT:END] in normal interview
    // turns is a bug and must be stripped silently.
    let chatEnd = false;
    if (/\[CHAT:\s*END\s*\]/i.test(assistantMessage)) {
      assistantMessage = assistantMessage.replace(/\s*\[CHAT:\s*END\s*\]\s*/gi, "").trim();
      // Honor the [CHAT:END] only when this is a promoter-fast-path
      // close. We detect that by the [REVIEW:YES|NO] tag appearing in
      // the same turn (already handled and stripped above) — if a
      // review tag fired, we know this is the fast-path's final wrap.
      // Otherwise we strip silently and treat the turn as a normal
      // ongoing interview reply.
      if (reviewMatch) {
        chatEnd = true;
      } else {
        logger.warn(
          { session_id: Number(session_id) },
          "Stripped stray model-emitted [CHAT:END] from interview turn"
        );
      }
    }

    // Save assistant message
    await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [
      Number(session_id),
      assistantMessage,
    ]);

    // Weave-in widget follows the reply that nominated it. Gated —
    // required questions always are. When the model wove one in, the
    // contextual nomination stands down: one widget per turn, and a
    // required delivery outranks an AI-discretion one.
    let widgetOut = null;
    if (weaveInQuestion) {
      const { content, payload } = await emitWidgetMessage(session, weaveInQuestion, {
        gate: true,
      });
      widgetOut = { content, payload };
    } else {
      const contextualQuestion = await contextualPromise;
      if (contextualQuestion) {
        const { content, payload } = await emitWidgetMessage(session, contextualQuestion, {
          gate: false,
        });
        widgetOut = { content, payload };
      }
    }

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
      ...(widgetOut && {
        widget: { content: widgetOut.content, widget_payload: widgetOut.payload },
      }),
    });
  } catch (err) {
    logger.error("Anthropic API error: %s", err.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

/**
 * Generate + save the playback and transition to
 * awaiting_playback_response. Shared by the main chat route (close
 * triggered by turn count / terminal language) and the /answer
 * continuation (baseline batch exhausted). Loads history fresh so
 * widget answers recorded moments ago are part of what gets played
 * back.
 */
async function firePlayback(session, reason) {
  const clientRow = await db.get("SELECT company_name FROM clients WHERE id = ?", [
    session.client_id,
  ]);
  const clientName = clientRow?.company_name || "your management company";

  const history = await db.all(
    "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    [session.id]
  );

  const playback = await generatePlayback({ clientName, history });

  await db.run("INSERT INTO messages (session_id, role, content) VALUES (?, 'assistant', ?)", [
    session.id,
    playback,
  ]);
  await db.run("UPDATE sessions SET close_phase = ? WHERE id = ?", [
    CLOSE_PHASE.AWAITING_PLAYBACK_RESPONSE,
    session.id,
  ]);
  logPhaseTransition({
    sessionId: session.id,
    from: session.close_phase,
    to: CLOSE_PHASE.AWAITING_PLAYBACK_RESPONSE,
    reason,
  });

  const savedMsg = await db.get(
    "SELECT created_at FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1",
    [session.id]
  );
  return { playback, timestamp: savedMsg?.created_at };
}

/**
 * Structured widget answer (hybrid survey, Phase D1).
 *
 * POST /api/chat/answer { session_id, question_id, value } — or
 * { ..., skip: true } for "Prefer not to answer" (recorded as a real
 * skipped row: declining is itself signal).
 *
 * The question definition comes from the session's frozen template
 * version config — never the mutable draft tables — so an answer
 * always matches exactly what was asked.
 */
router.post("/answer", async (req, res) => {
  const { session_id, question_id, value, skip } = req.body;
  if (!session_id || !question_id) {
    return res.status(400).json({ error: "session_id and question_id are required" });
  }
  if (!skip && value === undefined) {
    return res.status(400).json({ error: "value is required unless skipping" });
  }

  if (!checkRateLimit(session_id)) {
    return res.status(429).json({ error: "Too many messages. Please wait a moment." });
  }

  try {
    const session = await db.get("SELECT * FROM sessions WHERE id = ?", [Number(session_id)]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.close_phase === CLOSE_PHASE.DONE) {
      return res.status(409).json({ error: "This chat has already been closed." });
    }
    if (!session.template_version_id) {
      return res.status(400).json({ error: "This session does not run a survey template" });
    }

    const config = await getTemplateConfig(session.template_version_id);
    const question = config?.questions?.find((q) => q.question_id === Number(question_id));
    if (!question) {
      return res.status(400).json({ error: "Question is not part of this session's survey" });
    }

    const already = await db.get(
      "SELECT id FROM survey_answers WHERE session_id = ? AND question_id = ?",
      [Number(session_id), Number(question_id)]
    );
    if (already) {
      return res.status(409).json({ error: "This question was already answered" });
    }

    const { display } = await recordAnswer({
      session,
      question,
      value: skip ? null : value,
      skipped: !!skip,
    });

    // Baseline-batch continuation (Phase D2): the server walks the
    // required set one gated widget at a time. Each answer emits the
    // next widget; when the set is exhausted, the playback fires and
    // the normal close flow takes over.
    const next = [];
    if (session.close_phase === CLOSE_PHASE.BASELINE_BATCH) {
      const answered = await answeredQuestionIds(Number(session_id));
      const remaining = getUnansweredRequired(config, answered);
      if (remaining.length > 0) {
        const { content, payload } = await emitWidgetMessage(session, remaining[0], {
          gate: true,
        });
        next.push({ role: "assistant", content, message_type: "widget", widget_payload: payload });
      } else {
        const { playback } = await firePlayback(
          { ...session, pending_question_id: null },
          "baseline batch complete"
        );
        next.push({ role: "assistant", content: playback, message_type: "text" });
      }
    }

    res.json({ ok: true, display, next });
  } catch (err) {
    logger.error({ err }, "Failed to record survey answer");
    res.status(500).json({ error: "Failed to record answer" });
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

  // Note: this classifier intentionally bypasses the AI provider
  // router — it's a background safety check, always on Haiku for
  // cost/latency, never part of the Anthropic-vs-xAI comparison.
  const result = await anthropicCreateMessage({
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
