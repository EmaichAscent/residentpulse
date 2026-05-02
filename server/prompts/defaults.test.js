import { describe, it, expect } from "vitest";
import {
  V1_SYSTEM_PROMPT,
  V1_INTERVIEW_INITIAL,
  V1_PROMPT_GENERATION,
  V1_INTERVIEW_RE,
  LEGACY_SYSTEM_PROMPT_V0,
  LEGACY_SYSTEM_PROMPT_V05,
  LEGACY_SYSTEM_PROMPT_V09,
  V2_SYSTEM_PROMPT_V20,
  V2_SYSTEM_PROMPT_V21,
  V2_SYSTEM_PROMPT,
  V2_INTERVIEW_INITIAL,
  V2_PROMPT_GENERATION,
} from "./defaults.js";

describe("Legacy system_prompt defaults (frozen — exact byte lengths matter)", () => {
  // These were captured from prod on 2026-04-30. The migration matches against
  // them by exact equality, so any drift would silently stop catching stale rows.
  it("LEGACY_SYSTEM_PROMPT_V0 is exactly 1332 chars", () => {
    expect(LEGACY_SYSTEM_PROMPT_V0.length).toBe(1332);
  });

  it("LEGACY_SYSTEM_PROMPT_V05 is exactly 1441 chars", () => {
    expect(LEGACY_SYSTEM_PROMPT_V05.length).toBe(1441);
  });

  it("LEGACY_SYSTEM_PROMPT_V09 is exactly 1542 chars", () => {
    expect(LEGACY_SYSTEM_PROMPT_V09.length).toBe(1542);
  });

  it("V1_SYSTEM_PROMPT is exactly 2671 chars", () => {
    expect(V1_SYSTEM_PROMPT.length).toBe(2671);
  });

  it("legacy prompts are all distinct from each other", () => {
    const all = [
      LEGACY_SYSTEM_PROMPT_V0,
      LEGACY_SYSTEM_PROMPT_V05,
      LEGACY_SYSTEM_PROMPT_V09,
      V1_SYSTEM_PROMPT,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("V1 prompts (frozen — used as match keys by the migration)", () => {
  it("V1 prompts are non-empty strings", () => {
    expect(V1_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(V1_INTERVIEW_INITIAL.length).toBeGreaterThan(100);
    expect(V1_PROMPT_GENERATION.length).toBeGreaterThan(100);
    expect(V1_INTERVIEW_RE.length).toBeGreaterThan(100);
  });

  it("V1 prompts contain their canonical opening phrase (so the migration's exact-match works)", () => {
    expect(V1_SYSTEM_PROMPT).toMatch(/You are a friendly, professional data scientist/);
    expect(V1_INTERVIEW_INITIAL).toMatch(
      /You are a professional onboarding specialist for ResidentPulse/
    );
    expect(V1_PROMPT_GENERATION).toMatch(/Based on the following interview/);
  });
});

describe("V2 system prompt — board member interview (V2.2 current)", () => {
  it("targets [CLIENT_NAME] and frames the role minimally", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CLIENT_NAME\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/interviewing a board member/i);
  });

  it("encodes the anti-abstraction rule with the danger words", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Anti-abstraction rule/);
    expect(V2_SYSTEM_PROMPT).toMatch(/communication.*responsiveness.*transparency/);
    expect(V2_SYSTEM_PROMPT).toMatch(/abstract noun/i);
  });

  it("includes sensitive-topic guidance for legal + identity mentions", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Sensitive topics/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Legal.*litigation/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Identity-based complaints/i);
  });

  it("forbids identifying as an AI persona by name", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Identify yourself by an AI persona name/);
  });

  it("is differentiated from V1 (no 'data scientist' framing)", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V1_SYSTEM_PROMPT);
    expect(V2_SYSTEM_PROMPT).not.toMatch(/professional data scientist/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// V2.1 — frozen byte-perfect for migration matching. V2.1 was the
// first prompt that named forbidden first-sentence openers and added
// the worked post-NPS example, but live testing showed Haiku still
// drilling single threads for 14+ turns. V2.2 fixes that with hard
// caps + frustration handling.
// ──────────────────────────────────────────────────────────────────────────
describe("V2 system prompt — V2.0 + V2.1 frozen for migration matching", () => {
  it("V2_SYSTEM_PROMPT_V20 is preserved byte-perfect", () => {
    expect(V2_SYSTEM_PROMPT_V20.length).toBeGreaterThan(5500);
    expect(V2_SYSTEM_PROMPT_V20).toMatch(/curious journalist/);
    expect(V2_SYSTEM_PROMPT_V20).toMatch(/Anti-abstraction rule/);
    expect(V2_SYSTEM_PROMPT_V20).not.toMatch(/Forbidden first-sentence openers/);
  });

  it("V2_SYSTEM_PROMPT_V21 is preserved byte-perfect", () => {
    expect(V2_SYSTEM_PROMPT_V21.length).toBeGreaterThan(5500);
    expect(V2_SYSTEM_PROMPT_V21).toMatch(/curious journalist/);
    expect(V2_SYSTEM_PROMPT_V21).toMatch(/Forbidden first-sentence openers/);
    expect(V2_SYSTEM_PROMPT_V21).toMatch(/Worked example: the post-NPS opener/);
    // V21 did NOT yet contain the V2.2 hard-cap or frustration-signal
    // sections — that's how the migration tells them apart.
    expect(V2_SYSTEM_PROMPT_V21).not.toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT_V21).not.toMatch(/Frustration signals/);
  });

  it("V21 differs from V20", () => {
    expect(V2_SYSTEM_PROMPT_V21).not.toEqual(V2_SYSTEM_PROMPT_V20);
  });

  it("current V2_SYSTEM_PROMPT (V2.2) differs from V20 and V21", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V20);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V21);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// V2.2 — surgical rewrite. Cuts the prompt from ~200 lines to ~80, locks
// in operational constraints (5-7 question session cap, 3 follow-ups per
// thread max, frustration-signal pivot), and shows one before/after
// example drawn from a real failure transcript that ran 14+ turns on a
// single sprinkler-callback thread.
// ──────────────────────────────────────────────────────────────────────────
describe("V2 system prompt — V2.2 hard caps + frustration handling", () => {
  it("declares the session cap and per-thread cap up front", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Total session.*5.7 questions/);
    expect(V2_SYSTEM_PROMPT).toMatch(/3 follow-ups MAX/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Stop at 7/);
  });

  it("operationalizes the thread-completion checklist", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Thread completion/);
    expect(V2_SYSTEM_PROMPT).toMatch(/INCIDENT/);
    expect(V2_SYSTEM_PROMPT).toMatch(/WHO/);
    expect(V2_SYSTEM_PROMPT).toMatch(/WHEN/);
    expect(V2_SYSTEM_PROMPT).toMatch(/MISSED/);
    expect(V2_SYSTEM_PROMPT).toMatch(/your next reply MUST pivot/i);
  });

  it("names the frustration signals and demands an immediate pivot", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Frustration signals/);
    expect(V2_SYSTEM_PROMPT).toMatch(/I said/);
    expect(V2_SYSTEM_PROMPT).toMatch(/again/);
    expect(V2_SYSTEM_PROMPT).toMatch(/are you dumb/);
    expect(V2_SYSTEM_PROMPT).toMatch(/apologize once.*pivot/i);
  });

  it("includes the before/after detractor example from the real failure", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Worked example: detractor done right/);
    expect(V2_SYSTEM_PROMPT).toMatch(/sprinklers/i);
    expect(V2_SYSTEM_PROMPT).toMatch(/Michelle/);
    expect(V2_SYSTEM_PROMPT).toMatch(/CHECKLIST.*COMPLETE/i);
  });

  it("retains the forbidden first-sentence openers from V2.1", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Forbidden first-sentence openers/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Thanks for/);
    expect(V2_SYSTEM_PROMPT).toMatch(/I appreciate/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Looking at your history/);
  });

  it("retains the post-NPS gold-standard opener", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/A 6 — honest answer/);
    expect(V2_SYSTEM_PROMPT).toMatch(/biggest thing standing between you and a higher score/);
  });

  it("retains the prior-context invisibility rule (no meta-narration)", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Prior context/);
    expect(V2_SYSTEM_PROMPT).toMatch(/never meta-narrate/i);
  });

  it("forbids re-asking facts the resident already gave", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Ask for a fact the resident already gave/);
  });

  it("forbids drilling past the 3-probe cap", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Drill a thread past 3 follow-ups/);
  });

  it("is significantly shorter than V2.1 (the surgical-rewrite goal)", () => {
    // V2.1 was ~5500-9000 chars of mostly-philosophical guidance. V2.2
    // should be tighter while still hitting every operational rule.
    expect(V2_SYSTEM_PROMPT.length).toBeLessThan(V2_SYSTEM_PROMPT_V21.length);
  });
});

describe("V2 client onboarding interview", () => {
  it("introduces the senior consultant persona", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/senior consultant/i);
    expect(V2_INTERVIEW_INITIAL).toMatch(/200\+ residential management companies/);
  });

  it("structures the conversation in four phases", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 1.*Calibrate/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 2.*Concretize/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 3.*Forbid/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 4.*Vocabulary/);
  });

  it("includes the surprise-probe question (key supplement signal)", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/genuinely surprise you/);
  });

  it("requires mid-interview priority confirmation before Phase 3", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Mid-interview confirmation/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/biggest priority this quarter/);
  });
});

describe("V2 supplement generator", () => {
  it("specifies the required output structure", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/Output structure \(REQUIRED\)/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Company Context/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Priority Probes/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Forbidden Easy Answers/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Sensitive Topics/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Client Vocabulary/);
    expect(V2_PROMPT_GENERATION).toMatch(/## What Would Surprise Them/);
  });

  it("requires script + follow_up_if_vague structure for priority probes", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/SCRIPT:/);
    expect(V2_PROMPT_GENERATION).toMatch(/FOLLOW_UP_IF_VAGUE:/);
  });

  it("imposes a 600-word cap", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/600 words/);
  });

  it("describes re-interview diff behavior", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/RE-INTERVIEW/);
    expect(V2_PROMPT_GENERATION).toMatch(/Output a DIFF/);
  });
});
