import { createMessage as anthropicCreateMessage } from "./anthropicClient.js";
import logger from "./logger.js";

/**
 * Trigger classifier (Zoho parity Phases C3 + D3 —
 * docs/ZOHO_PARITY_PLAN.md).
 *
 * Triggers are plain-English descriptions ("resident mentions gate,
 * entry system, or security problems"). This module answers two
 * questions with a lightweight Haiku call each:
 *
 *   classifyMessage(message, triggers)
 *     → which of these trigger descriptions does this resident
 *       message match? Used BOTH at design time (the question
 *       editor's Test box) and at runtime (Phase D3 contextual
 *       nomination) — so what the operator sees in the editor is
 *       exactly what production will do.
 *
 *   checkOverlaps(description, existingTriggers)
 *     → which existing triggers semantically overlap the candidate
 *       description (common resident messages would match both)?
 *       Backs the editor's save-time conflict callout.
 *
 * Both intentionally call anthropicClient DIRECTLY, bypassing the
 * AI provider router: these are infrastructure classifiers (same
 * convention as the critical-alert detector), not part of the
 * Anthropic-vs-xAI chat comparison, and Haiku's cost/latency profile
 * is the point.
 */

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

function parseJsonReply(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * @param {string} message — the resident's message
 * @param {Array<{id, label, description}>} triggers — active trigger set
 * @returns {Promise<number[]>} ids of matching triggers (possibly empty)
 */
export async function classifyMessage(message, triggers) {
  if (!message?.trim() || !triggers?.length) return [];

  const numbered = triggers.map((t, i) => `${i + 1}. ${t.description}`).join("\n");

  const result = await anthropicCreateMessage({
    model: CLASSIFIER_MODEL,
    max_tokens: 100,
    system: `You match a board member's survey message against trigger conditions. Reply with ONLY a JSON array of the numbers of conditions the message matches, e.g. [1,3] or []. Match on meaning, not exact words — "the gate's been busted forever" matches a condition about gate or security problems. Do not match conditions the message merely brushes against; the message must substantively touch the condition's topic.

Conditions:
${numbered}`,
    messages: [{ role: "user", content: message }],
  });

  const parsed = parseJsonReply(result.content[0].text.trim());
  if (!Array.isArray(parsed)) {
    logger.warn({ reply: result.content[0].text }, "triggerClassifier: unparseable classify reply");
    return [];
  }
  return parsed
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= triggers.length)
    .map((n) => triggers[n - 1].id);
}

/**
 * @param {string} description — candidate trigger description
 * @param {Array<{id, label, description}>} existingTriggers
 * @returns {Promise<number[]>} ids of existing triggers that overlap
 */
export async function checkOverlaps(description, existingTriggers) {
  if (!description?.trim() || !existingTriggers?.length) return [];

  const numbered = existingTriggers.map((t, i) => `${i + 1}. ${t.description}`).join("\n");

  const result = await anthropicCreateMessage({
    model: CLASSIFIER_MODEL,
    max_tokens: 100,
    system: `You compare survey trigger conditions for semantic overlap. Two conditions OVERLAP when a typical board-member message could plausibly match both (one topic contains the other, or they describe the same kind of complaint in different words). Reply with ONLY a JSON array of the numbers of existing conditions that overlap the candidate, e.g. [2] or [].

Existing conditions:
${numbered}`,
    messages: [{ role: "user", content: `Candidate condition: ${description}` }],
  });

  const parsed = parseJsonReply(result.content[0].text.trim());
  if (!Array.isArray(parsed)) {
    logger.warn({ reply: result.content[0].text }, "triggerClassifier: unparseable overlap reply");
    return [];
  }
  return parsed
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= existingTriggers.length)
    .map((n) => existingTriggers[n - 1].id);
}
