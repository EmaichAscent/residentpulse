/**
 * promptBlocks — round-trippable parser/formatter for the structured
 * block format the SuperAdmin design handoff specifies (§4 + §5).
 *
 * The current production prompts in defaults.js are giant template
 * literals shaped as:
 *
 *   ## Section heading
 *
 *   Section body text...
 *
 *   ---
 *
 *   ## Next section heading
 *
 *   Next section body...
 *
 * The handoff wants them rendered as structured blocks of
 *   { heading: string, kind: BlockKind, body: string }
 *
 * so the SuperAdmin Prompts Library page can render each block as a
 * tinted card with kind-specific styling (persona = green, phase =
 * plum, critical = amber+red pill, rules = white card).
 *
 * This file gives us BOTH directions cleanly:
 *
 *   parsePromptToBlocks(str)      → array of blocks
 *   blocksToPrompt(blocks)        → original string (round-trips)
 *   classifyBlockKind(heading)    → default heuristic for kind
 *
 * The runtime (chat.js / interview.js) keeps using the assembled
 * string. The block array is for the editor + diff modal + version
 * history. Anything that changes blocks → regenerate string →
 * write to settings.value the same way as before.
 *
 * Round-trip stability is the contract: anything we parse must
 * format back into the same bytes (modulo trailing newline). The
 * defaults.test.js suite asserts this for every shipped prompt.
 */

/**
 * Block kind enum — matches the handoff's visual design tokens.
 * Drives the SuperAdmin editor's per-block tint + label.
 */
export const BLOCK_KIND = Object.freeze({
  PERSONA: "persona", // green tint — role / identity / scope of the AI
  PHASE: "phase", // plum tint — sequenced phases (onboarding only)
  RULES: "rules", // white card — standard instructions
  CRITICAL: "critical", // amber tint + red CRITICAL pill — non-negotiable / safety
});

const ALLOWED_KINDS = new Set(Object.values(BLOCK_KIND));

/**
 * Default classifier. The current prompts use predictable headings,
 * so a small set of regex rules covers them. Callers can override
 * by passing their own classifier to parsePromptToBlocks.
 *
 * Returns one of BLOCK_KIND.*
 */
export function classifyBlockKind(heading) {
  if (!heading) return BLOCK_KIND.RULES;
  const h = heading.toLowerCase();

  // Persona / role / task — the "who you are / what you do" block
  if (/^(persona|role|task)\b/.test(h)) return BLOCK_KIND.PERSONA;

  // Onboarding phases (Phase 1 / Phase 2 / etc.) — plum tint
  if (/^phase\s+\d/.test(h)) return BLOCK_KIND.PHASE;

  // Critical / non-negotiable / never / must / required — amber + red
  if (
    /\bcritical\b/.test(h) ||
    /\bnon-negotiable\b/.test(h) ||
    /\bnever\b/.test(h) ||
    /\bforbidden\b/.test(h) ||
    /\brequired\b/.test(h) ||
    /\bmust\b/.test(h) ||
    /\banti-abstraction\b/.test(h) ||
    /\bdepth budget\b/.test(h) ||
    /\bquality bar\b/.test(h) ||
    /\bcommon failure mode\b/.test(h) ||
    /\bhard constraints\b/.test(h) ||
    /\bhard rules\b/.test(h) ||
    /\babsolute\b/.test(h)
  ) {
    return BLOCK_KIND.CRITICAL;
  }

  return BLOCK_KIND.RULES;
}

/**
 * Parse a prompt string into an array of blocks.
 *
 * Splits on a line containing only `---` (a markdown horizontal
 * rule, used in the prompts as a section separator). Each section
 * is expected to start with `## Heading` followed by body text.
 *
 *   parsePromptToBlocks(`## Role\n\nYou are a...\n\n---\n\n## Rules\n\nDo X.`)
 *   → [
 *       { heading: "Role",  kind: "persona", body: "You are a..." },
 *       { heading: "Rules", kind: "rules",   body: "Do X." },
 *     ]
 *
 * Empty sections / sections without a `## ` heading are skipped.
 *
 * @param {string} prompt        — the assembled prompt string
 * @param {object} [options]
 * @param {Function} [options.classifyKind]  — heading → kind override
 * @returns {Array<{heading, kind, body}>}
 */
export function parsePromptToBlocks(prompt, { classifyKind = classifyBlockKind } = {}) {
  if (!prompt || typeof prompt !== "string") return [];

  // Split on a line that contains only `---` (with optional surrounding
  // whitespace). The split keeps empty segments at the boundaries when
  // the prompt starts/ends with a separator — those get filtered out.
  const sections = prompt
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks = [];
  for (const section of sections) {
    // First non-blank line should be `## Heading`. Anything else gets
    // treated as a body-only block with empty heading (rare; only
    // happens if a section has no heading line).
    const headingMatch = section.match(/^##\s+(.+?)\s*$/m);
    if (!headingMatch) {
      blocks.push({
        heading: "",
        kind: classifyKind("") || BLOCK_KIND.RULES,
        body: section,
      });
      continue;
    }
    const heading = headingMatch[1];
    // Body = everything after the heading line, trimmed.
    const headingEnd = headingMatch.index + headingMatch[0].length;
    const body = section
      .slice(headingEnd)
      .replace(/^\s*\n+/, "")
      .trimEnd();
    blocks.push({ heading, kind: classifyKind(heading), body });
  }
  return blocks;
}

/**
 * Format an array of blocks back into a prompt string.
 *
 *   blocksToPrompt([
 *     { heading: "Role",  body: "You are a..." },
 *     { heading: "Rules", body: "Do X." },
 *   ])
 *   → `## Role\n\nYou are a...\n\n---\n\n## Rules\n\nDo X.`
 *
 * Round-trips with parsePromptToBlocks: any string parsed and
 * re-formatted produces the original string (modulo trailing
 * whitespace normalization).
 */
export function blocksToPrompt(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return blocks
    .map((b) => {
      if (!b) return "";
      const heading = b.heading ? `## ${b.heading}` : "";
      const body = b.body || "";
      // Heading + blank line + body
      return heading ? `${heading}\n\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Validate that a block has a known kind. Defaults unknown kinds to
 * "rules" so corrupt persisted data still renders.
 */
export function normalizeBlock(block) {
  return {
    heading: typeof block?.heading === "string" ? block.heading : "",
    kind: ALLOWED_KINDS.has(block?.kind) ? block.kind : BLOCK_KIND.RULES,
    body: typeof block?.body === "string" ? block.body : "",
  };
}

/**
 * Round-trip a prompt string: parse → format. Used in tests to
 * guarantee the parser is lossless.
 */
export function roundTripPrompt(prompt) {
  return blocksToPrompt(parsePromptToBlocks(prompt));
}
