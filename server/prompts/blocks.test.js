import { describe, it, expect } from "vitest";
import {
  parsePromptToBlocks,
  blocksToPrompt,
  classifyBlockKind,
  normalizeBlock,
  roundTripPrompt,
  BLOCK_KIND,
} from "./blocks.js";
import {
  V2_SYSTEM_PROMPT,
  V2_INTERVIEW_INITIAL,
  V2_PROMPT_GENERATION,
  V2_SYSTEM_PROMPT_BLOCKS,
  V2_INTERVIEW_INITIAL_BLOCKS,
  V2_PROMPT_GENERATION_BLOCKS,
} from "./defaults.js";

/**
 * The block parser is a pure-string round-trip — anything we parse
 * must format back into the exact bytes we started with. If this
 * suite goes red, the SuperAdmin Prompts Library will silently
 * corrupt edited prompts on save.
 */

describe("parsePromptToBlocks — basics", () => {
  it("splits sections on `---` separator lines", () => {
    const input = `## A\n\nbody A\n\n---\n\n## B\n\nbody B`;
    const blocks = parsePromptToBlocks(input);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].heading).toBe("A");
    expect(blocks[0].body).toBe("body A");
    expect(blocks[1].heading).toBe("B");
    expect(blocks[1].body).toBe("body B");
  });

  it("preserves multi-line bodies including bullets and blank lines", () => {
    const input = `## Rules\n\n  • One\n  • Two\n\nFinal note.`;
    const [block] = parsePromptToBlocks(input);
    expect(block.body).toBe("  • One\n  • Two\n\nFinal note.");
  });

  it("returns [] for null/empty input", () => {
    expect(parsePromptToBlocks("")).toEqual([]);
    expect(parsePromptToBlocks(null)).toEqual([]);
    expect(parsePromptToBlocks(undefined)).toEqual([]);
  });

  it("ignores stray separators at the start/end", () => {
    const input = `---\n\n## A\n\nbody A\n\n---`;
    const blocks = parsePromptToBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toBe("A");
  });

  it("classifies block kinds via the default classifier", () => {
    const input = `## Role\n\nYou are a journalist.\n\n---\n\n## Hard constraints\n\nDo X.\n\n---\n\n## Phase 1 — Calibrate\n\nStart here.\n\n---\n\n## Stay on a thread\n\nKeep digging.`;
    const blocks = parsePromptToBlocks(input);
    expect(blocks[0].kind).toBe(BLOCK_KIND.PERSONA);
    expect(blocks[1].kind).toBe(BLOCK_KIND.CRITICAL);
    expect(blocks[2].kind).toBe(BLOCK_KIND.PHASE);
    expect(blocks[3].kind).toBe(BLOCK_KIND.RULES);
  });

  it("accepts a custom classifier override", () => {
    const input = `## A\n\nbody`;
    const blocks = parsePromptToBlocks(input, {
      classifyKind: () => BLOCK_KIND.CRITICAL,
    });
    expect(blocks[0].kind).toBe(BLOCK_KIND.CRITICAL);
  });
});

describe("classifyBlockKind", () => {
  it("classifies persona / role / task as persona", () => {
    expect(classifyBlockKind("Persona")).toBe(BLOCK_KIND.PERSONA);
    expect(classifyBlockKind("Role")).toBe(BLOCK_KIND.PERSONA);
    expect(classifyBlockKind("Task")).toBe(BLOCK_KIND.PERSONA);
  });

  it("classifies onboarding phases as phase", () => {
    expect(classifyBlockKind("Phase 1 — Calibrate")).toBe(BLOCK_KIND.PHASE);
    expect(classifyBlockKind("Phase 2 — Concretize")).toBe(BLOCK_KIND.PHASE);
    expect(classifyBlockKind("Phase 3 — Forbid")).toBe(BLOCK_KIND.PHASE);
    expect(classifyBlockKind("Phase 4 — Vocabulary")).toBe(BLOCK_KIND.PHASE);
  });

  it("classifies non-negotiable / forbidden / never sections as critical", () => {
    expect(classifyBlockKind("Hard constraints (non-negotiable)")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("What you must NEVER do")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Forbidden first-sentence openers")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Anti-abstraction rule")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Common failure mode (DO NOT REPEAT)")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Quality bar")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Output structure (REQUIRED)")).toBe(BLOCK_KIND.CRITICAL);
    expect(classifyBlockKind("Depth budget — varies by NPS score")).toBe(BLOCK_KIND.CRITICAL);
  });

  it("defaults to rules for everything else", () => {
    expect(classifyBlockKind("Conversation rhythm")).toBe(BLOCK_KIND.RULES);
    expect(classifyBlockKind("Stay on a thread")).toBe(BLOCK_KIND.RULES);
    expect(classifyBlockKind("Coverage areas")).toBe(BLOCK_KIND.RULES);
    expect(classifyBlockKind("")).toBe(BLOCK_KIND.RULES);
  });
});

describe("blocksToPrompt — formatter", () => {
  it("joins blocks with the canonical `---` separator", () => {
    const blocks = [
      { heading: "A", body: "body A" },
      { heading: "B", body: "body B" },
    ];
    expect(blocksToPrompt(blocks)).toBe(`## A\n\nbody A\n\n---\n\n## B\n\nbody B`);
  });

  it("returns empty string for empty input", () => {
    expect(blocksToPrompt([])).toBe("");
    expect(blocksToPrompt(null)).toBe("");
  });

  it("omits heading line when block has empty heading", () => {
    const blocks = [{ heading: "", body: "raw body" }];
    expect(blocksToPrompt(blocks)).toBe("raw body");
  });
});

describe("normalizeBlock", () => {
  it("falls back to safe defaults for malformed input", () => {
    expect(normalizeBlock(null)).toEqual({ heading: "", kind: "rules", body: "" });
    expect(normalizeBlock({})).toEqual({ heading: "", kind: "rules", body: "" });
    expect(normalizeBlock({ kind: "weird" })).toEqual({
      heading: "",
      kind: "rules",
      body: "",
    });
  });

  it("preserves valid kinds", () => {
    for (const kind of Object.values(BLOCK_KIND)) {
      expect(normalizeBlock({ heading: "h", kind, body: "b" }).kind).toBe(kind);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CRITICAL: round-trip stability for every shipped prompt.
//
// If this fails, anything saved through the SuperAdmin Prompts Library
// editor (which writes parsed-then-formatted blocks back to settings)
// will silently mutate the prompt content on first save.
// ──────────────────────────────────────────────────────────────────────────

describe("Round-trip stability — current V2 prompts", () => {
  it("V2_SYSTEM_PROMPT round-trips losslessly through parse → format", () => {
    expect(roundTripPrompt(V2_SYSTEM_PROMPT)).toBe(V2_SYSTEM_PROMPT);
  });

  it("V2_INTERVIEW_INITIAL round-trips losslessly", () => {
    expect(roundTripPrompt(V2_INTERVIEW_INITIAL)).toBe(V2_INTERVIEW_INITIAL);
  });

  it("V2_PROMPT_GENERATION round-trips losslessly", () => {
    expect(roundTripPrompt(V2_PROMPT_GENERATION)).toBe(V2_PROMPT_GENERATION);
  });
});

describe("Derived block exports — shape + content", () => {
  it("V2_SYSTEM_PROMPT_BLOCKS has the V3.0 sections", () => {
    // V3.0 nuked the V2.x worked-example blocks (Common failure mode,
    // Worked example: detractor done right, etc.). The remaining
    // structure is leaner — assert on what V3.0 actually has.
    expect(V2_SYSTEM_PROMPT_BLOCKS.length).toBeGreaterThanOrEqual(7);
    const headings = V2_SYSTEM_PROMPT_BLOCKS.map((b) => b.heading);
    expect(headings).toContain("Role");
    expect(headings.some((h) => /Hard rules/.test(h))).toBe(true);
    expect(headings.some((h) => /Forbidden phrases/.test(h))).toBe(true);
    expect(headings.some((h) => /Coverage areas/.test(h))).toBe(true);
    expect(headings.some((h) => /Forward-looking probe/.test(h))).toBe(true);
    expect(headings.some((h) => /Closing wrap-up/.test(h))).toBe(true);
  });

  it("V2_SYSTEM_PROMPT_BLOCKS classifies the Role block as persona", () => {
    const role = V2_SYSTEM_PROMPT_BLOCKS.find((b) => b.heading === "Role");
    expect(role).toBeDefined();
    expect(role.kind).toBe(BLOCK_KIND.PERSONA);
  });

  it("V2_SYSTEM_PROMPT_BLOCKS classifies Hard rules as critical", () => {
    const hc = V2_SYSTEM_PROMPT_BLOCKS.find((b) => /Hard rules/.test(b.heading));
    expect(hc).toBeDefined();
    expect(hc.kind).toBe(BLOCK_KIND.CRITICAL);
  });

  it("V2_INTERVIEW_INITIAL_BLOCKS has the four onboarding phases as phase blocks", () => {
    const phases = V2_INTERVIEW_INITIAL_BLOCKS.filter((b) => b.kind === BLOCK_KIND.PHASE);
    expect(phases.length).toBeGreaterThanOrEqual(4);
    expect(phases.some((p) => /Phase 1/.test(p.heading))).toBe(true);
    expect(phases.some((p) => /Phase 4/.test(p.heading))).toBe(true);
  });

  it("V2_PROMPT_GENERATION_BLOCKS classifies Task as persona + Required output as critical", () => {
    const task = V2_PROMPT_GENERATION_BLOCKS.find((b) => b.heading === "Task");
    expect(task).toBeDefined();
    expect(task.kind).toBe(BLOCK_KIND.PERSONA);
    // Current V2.1 supplement generator names this section "Required
    // output (sections in this order, no omissions)" — the classifier
    // catches it via the \brequired\b rule.
    const out = V2_PROMPT_GENERATION_BLOCKS.find((b) => /Required output/.test(b.heading));
    expect(out).toBeDefined();
    expect(out.kind).toBe(BLOCK_KIND.CRITICAL);
  });
});
