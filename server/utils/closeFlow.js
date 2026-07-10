import { createMessage } from "./aiRouter.js";
import logger from "./logger.js";

/**
 * Programmatic close-flow state machine for board interviews.
 *
 * V3.0 prompt engineering plateaued — both Grok and Claude consistently
 * violate the closing rules (no canonical "Thank you for your time"
 * line, no structured 2-sentence playback, run past 7 questions). This
 * module takes the close out of the model's hands entirely:
 *
 *   1. While `sessions.close_phase = 'interview'`, the AI generates
 *      questions normally (via aiRouter, current AI provider).
 *
 *   2. The server decides when to close (turn count threshold OR
 *      terminal-language detection in the user's message). At that
 *      point chat.js calls generatePlayback() — a tightly-scoped
 *      single-purpose AI call that produces ONLY the 2-sentence
 *      playback + the canonical "Anything missing…" question. It
 *      flips close_phase to 'awaiting_playback_response'.
 *
 *   3. On the next user message (their response to the playback),
 *      chat.js sees `close_phase = 'awaiting_playback_response'` and
 *      calls generateFinalClose() — pure code, no LLM. Emits the
 *      templated 3-element close: what-happens-next + (conditional)
 *      faster-channel bridge + the canonical closing line + [CHAT:END].
 *      Phase flips to 'done'.
 *
 * Why this works when prompt rules don't:
 *   • The playback prompt is ~60 lines, single purpose. Hard for the
 *     model to mess up because there's nothing else to do.
 *   • The final close has ZERO model involvement. It's plain code
 *     concatenating known-correct strings. Cannot be wrong.
 *   • Turn count is enforced by the server, so we can't blow past 7.
 */

// ── Tunable thresholds ───────────────────────────────────────────────

// Total AI messages before the server forces playback. V3.0 says
// "5–7 questions total. Stop at 7." Allowing 5 questions + 1 playback
// + 1 final close = 7 AI messages total. So we fire playback when
// AI message count is about to exceed PLAYBACK_TURN_THRESHOLD.
const PLAYBACK_TURN_THRESHOLD = 5;

// Minimum AI turns before terminal-language detection can trigger
// early playback. Without this, "I'm done" answered to "are there any
// urgent issues?" at turn 2 would close the chat prematurely.
const MIN_TURNS_BEFORE_TERMINAL_CLOSE = 3;

// ── Detection ────────────────────────────────────────────────────────

/**
 * Word-boundary regex matching phrases that indicate the resident is
 * signaling they're done with the conversation. Lowercased input
 * expected.
 */
const TERMINAL_LANGUAGE_RE =
  /\b(that'?s all|that'?s it|that is it|i'?m good|i'?m done|i am done|gotta go|got to go|have to go|nothing else|no more|nope|no more concerns|no other concerns|done|i think that'?s enough|that'?s enough|nothing more|all i (have|got))\b/i;

export function userSignaledDone(userMessage) {
  if (typeof userMessage !== "string") return false;
  const trimmed = userMessage.trim();
  // Single short answers count too — "no" / "nope" / "nothing" all
  // common 1-word terminal answers when the AI just asked an
  // "anything else?" question.
  if (/^\s*(no|nope|nothing|none|n\/a)\.?\s*$/i.test(trimmed)) return true;
  return TERMINAL_LANGUAGE_RE.test(trimmed);
}

/**
 * Decide whether the next AI reply should be the playback (Step 2 of
 * the close), instead of a normal interview question.
 *
 * Inputs:
 *   • aiMessageCount  — how many AI messages already exist in this
 *                       session, BEFORE generating the next one
 *   • userMessage     — the most recent user message that triggered
 *                       this turn
 *
 * Returns true when the server should fire the playback this turn.
 */
export function shouldFirePlayback({ aiMessageCount, userMessage }) {
  // Hard cap: at PLAYBACK_TURN_THRESHOLD AI messages, we MUST close.
  // The next AI reply (#PLAYBACK_TURN_THRESHOLD+1) is the playback.
  if (aiMessageCount >= PLAYBACK_TURN_THRESHOLD) return true;

  // Soft trigger: resident signaled they're done, AND we have at
  // least MIN_TURNS_BEFORE_TERMINAL_CLOSE AI turns of substantive
  // content to summarize.
  if (aiMessageCount >= MIN_TURNS_BEFORE_TERMINAL_CLOSE && userSignaledDone(userMessage)) {
    return true;
  }

  return false;
}

// ── Step 2: Playback (scoped LLM call) ──────────────────────────────

/**
 * Canonical closing question — must end every playback verbatim.
 */
export const CANONICAL_PLAYBACK_QUESTION =
  "Anything missing from that, or anything else I should pass along?";

/**
 * Build the system prompt for the playback step. Single-purpose,
 * intentionally tight — the model has ONE job: summarize what was
 * heard in 2 sentences + the canonical open question. No room to
 * meander into the issues we kept seeing in V3.0 production tests.
 */
function buildPlaybackSystemPrompt(clientName) {
  return `You are generating ONE message — a closing summary playback — for a board-member NPS interview about ${clientName}.

The conversation transcript will be provided as data inside a single user message. You are NOT continuing the interview. You are NOT asking another follow-up question. The interview is OVER. Your job is to produce the wrap-up summary.

Output format (exactly, in this order, nothing else):

  Sentence 1 — what ${clientName} is doing well based on THIS conversation. Cite specifics, not generic praise. If the board member gave NO positive feedback at all, skip this sentence entirely.
  Sentence 2 — what's pulling their score down. Name the root issue in one sentence.
  Then this exact closing question, verbatim, on the same paragraph:

    ${CANONICAL_PLAYBACK_QUESTION}

DO NOT include:
  • "Thanks", "I appreciate", "Got it", "That makes sense", or any sycophancy
  • The final closing line ("Thank you for your time…")
  • The hidden tag [CHAT:END]
  • Bullet points, headers, or meta-commentary
  • Another follow-up question of your own — only the canonical closing question above is allowed

Output the message a board member would see — plain prose, 1–2 sentences, then the verbatim closing question.`;
}

/**
 * Format a transcript as a single string. Going inline-as-data inside
 * one user message is far more reliable than replaying the multi-turn
 * history. When the assistant's prior turns are interleaved as their
 * own message roles, models pattern-match into "keep asking questions"
 * and produce a fresh interview question instead of the playback. We
 * saw this fail in production with Sonnet 4.5 — it ignored the
 * playback system prompt and asked another follow-up.
 */
function formatTranscript(history) {
  return history
    .map((m) => {
      const speaker = m.role === "user" ? "Board member" : "Interviewer";
      return `${speaker}: ${m.content}`;
    })
    .join("\n\n");
}

/**
 * Generate the playback reply by calling the active AI provider with
 * the scoped playback prompt + the conversation as inline data. Returns
 * the playback text (no [CHAT:END] tag — that goes on the FINAL close,
 * one turn later).
 *
 * Two reliability tricks vs the naive history-replay approach:
 *   1. The transcript is a single user-role message. Removes the
 *      "you've been asking questions, ask another one" pattern bias.
 *   2. If the returned text is missing the canonical closing question,
 *      we append it — defense in depth. The full close pipeline must
 *      ALWAYS end the playback with that exact question, otherwise the
 *      next turn's templated final-close looks abrupt.
 */
export async function generatePlayback({ clientName, history }) {
  const systemPrompt = buildPlaybackSystemPrompt(clientName);
  const transcript = formatTranscript(history);
  const response = await createMessage({
    model: "claude-sonnet-4-5-20250929", // routed → Grok-4.3-latest if toggle is xAI
    max_tokens: 250,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Conversation transcript follows. Produce the closing playback as instructed.\n\n---\n\n${transcript}\n\n---\n\nNow produce the playback. Do NOT continue the interview.`,
      },
    ],
  });
  let text = response.content?.[0]?.text || "";
  // Defense-in-depth: strip any [CHAT:END] the model might emit. Only
  // the final close gets the tag.
  text = text.replace(/\s*\[CHAT:END\]\s*/gi, "").trim();
  // Defense-in-depth: if the model dropped or rephrased the canonical
  // closing question, append it. Without this question the resident
  // doesn't know the chat is wrapping up, and our gate logic depends
  // on the next user reply being a response to "anything missing?".
  if (!text.toLowerCase().includes("anything missing from that")) {
    text = `${text} ${CANONICAL_PLAYBACK_QUESTION}`.trim();
  }
  return text;
}

// ── Step 3: Final close (templated, no LLM) ─────────────────────────

/**
 * Heuristic: does the conversation revolve around responsiveness or
 * any other time-sensitive operational complaint? If yes, V3.0's close
 * spec says we include a "reach out directly for urgent things"
 * bridge sentence.
 */
export function isTimeSensitiveComplaint(conversationText) {
  if (typeof conversationText !== "string") return false;
  const t = conversationText.toLowerCase();
  return (
    /\b(response|callback|call back|reach\s+(?:out|them|us)|hear back|email|on hold|days|weeks|delay|slow|getting hold|get a hold|takes forever|never call|no(t|n)e responded|unanswered)\b/.test(
      t
    ) ||
    /\b(communication|responsiveness|follow.?up|follow.?through|messages? not return|priorities? .*(close out|got dropped|fall through))\b/.test(
      t
    )
  );
}

/**
 * Build the final close message. Pure code — no model, no surprises.
 *
 * Components, in order:
 *   1. ONE sentence: "This goes back to {client} as part of this
 *      round's results. Patterns across multiple board members tend
 *      to drive their action plans."
 *   2. (Conditional) Faster-channel bridge sentence if the complaint
 *      is time-sensitive (responsiveness, communication, etc.)
 *   3. The canonical closing line: "Thank you for your time, I'm
 *      concluding this chat."
 *   4. The hidden tag [CHAT:END]
 */
export function generateFinalClose({ clientName, conversationText }) {
  const sentences = [
    `This goes back to ${clientName} as part of this round's results. Patterns across multiple board members tend to drive their action plans.`,
  ];

  if (isTimeSensitiveComplaint(conversationText)) {
    sentences.push(
      `If something urgent comes up before the next round, please reach out to them directly — your concerns deserve a faster channel than a quarterly survey.`
    );
  }

  sentences.push(`Thank you for your time, I'm concluding this chat.`);

  return `${sentences.join(" ")} [CHAT:END]`;
}

// ── Public surface ──────────────────────────────────────────────────

export const CLOSE_PHASE = Object.freeze({
  INTERVIEW: "interview",
  // Hybrid survey (Phase D2): the server is walking the resident
  // through unanswered REQUIRED widgets before the playback. Answers
  // arrive via POST /api/chat/answer, which emits the next widget or
  // fires the playback when the required set is exhausted.
  BASELINE_BATCH: "baseline_batch",
  // Hybrid promoters (review-enabled clients, score at/above the
  // threshold): after the required set is done, the server asks for a
  // Google review instead of the playback. The next user message is
  // parsed yes/no, recorded on the session, and the templated final
  // close follows. Server-driven — the legacy model-driven fast-path
  // ([REVIEW:YES|NO] + [CHAT:END]) remains for non-template sessions.
  AWAITING_REVIEW_RESPONSE: "awaiting_review_response",
  AWAITING_PLAYBACK_RESPONSE: "awaiting_playback_response",
  DONE: "done",
});

/**
 * The server-driven review ask (hybrid promoter close). One sentence,
 * one question — promoters are time-poor.
 */
export function generateReviewAsk(clientName) {
  return `Quick favor before we wrap — would you be willing to leave ${clientName} a short Google review? It genuinely helps them.`;
}

/**
 * Classify the resident's reply to the review ask. Conservative by
 * design: only a clear yes counts — an ambiguous reply must never
 * push a review link on someone.
 */
export function parseReviewReply(userMessage) {
  if (typeof userMessage !== "string") return "no";
  const t = userMessage.trim().toLowerCase();
  if (/\b(no|nope|nah|not|rather not|don't|dont|won't|wont|pass)\b/.test(t)) return "no";
  if (
    /\b(yes|yeah|yep|sure|ok|okay|absolutely|of course|happy to|will do|why not|definitely|certainly|glad to)\b/.test(
      t
    )
  ) {
    return "yes";
  }
  return "no";
}

/**
 * Strip any model-emitted [CHAT:END] tag from a normal interview
 * reply. Defense-in-depth: V3.0 still has closing instructions in the
 * prompt, so the model COULD self-emit [CHAT:END] mid-conversation.
 * We never want that — the only legitimate [CHAT:END] is the one the
 * server attaches to the final close.
 */
export function stripChatEndTag(text) {
  if (typeof text !== "string") return text;
  return text.replace(/\s*\[CHAT:END\]\s*/gi, "").trim();
}

// Logger helper used by chat.js when transitioning phases. Makes
// production debugging easier than guessing why a session ended.
export function logPhaseTransition({ sessionId, from, to, reason }) {
  logger.info({ session_id: sessionId, from, to, reason }, "close_phase transition");
}

// Exported for tests
export const __TEST__ = Object.freeze({
  PLAYBACK_TURN_THRESHOLD,
  MIN_TURNS_BEFORE_TERMINAL_CLOSE,
});
