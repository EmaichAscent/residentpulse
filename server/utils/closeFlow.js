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
 * Build the system prompt for the playback step. Single-purpose,
 * intentionally tight — the model has ONE job: summarize what was
 * heard in 2 sentences + the canonical open question. No room to
 * meander into the issues we kept seeing in V3.0 production tests.
 */
function buildPlaybackSystemPrompt(clientName) {
  return `You are generating ONE message for the end of a board-member NPS interview about ${clientName}. The full conversation transcript is in the message history.

Your job: produce a 2-sentence playback that summarizes what the resident said, BOTH SIDES if both came up.

  • Sentence 1 — what ${clientName} is doing well: cite specifics from THIS conversation, not generic praise. If the resident gave NO positive feedback, skip this sentence and write only sentence 2.
  • Sentence 2 — what's pulling their score down: name the root issue.

End your message EXACTLY with this open question (verbatim, no rephrasing):

  Anything missing from that, or anything else I should pass along?

CRITICAL — your output is exactly the playback sentence(s) followed by the canonical question. Nothing else.

DO NOT include:
  • "Thanks", "I appreciate", "Got it", "That makes sense", or any sycophancy
  • The closing line ("Thank you for your time…")
  • The hidden tag [CHAT:END]
  • Bullet points, headers, or any meta-commentary

Output exactly the message a board member would receive — plain prose, 1–2 sentences, then the verbatim open question.`;
}

/**
 * Generate the playback reply by calling the active AI provider with
 * the scoped playback prompt + the conversation history. Returns the
 * playback text (no [CHAT:END] tag — that goes on the FINAL close,
 * one turn later).
 */
export async function generatePlayback({ clientName, history }) {
  const systemPrompt = buildPlaybackSystemPrompt(clientName);
  const response = await createMessage({
    model: "claude-sonnet-4-5-20250929", // routed → Grok-4.3-latest if toggle is xAI
    max_tokens: 250,
    system: systemPrompt,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  let text = response.content?.[0]?.text || "";
  // Defense-in-depth: even if the scoped prompt is misunderstood and
  // the model emits [CHAT:END], strip it. Only the final close gets
  // the tag.
  text = text.replace(/\s*\[CHAT:END\]\s*/gi, "").trim();
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
  AWAITING_PLAYBACK_RESPONSE: "awaiting_playback_response",
  DONE: "done",
});

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
