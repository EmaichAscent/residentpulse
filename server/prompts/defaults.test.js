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

describe("V2 system prompt — board member interview", () => {
  it("introduces the journalist persona", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/curious journalist/i);
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CLIENT_NAME\]/);
  });

  it("encodes the anti-abstraction rule with the danger words", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Anti-abstraction rule/);
    expect(V2_SYSTEM_PROMPT).toMatch(/communication.*responsiveness.*transparency/);
    expect(V2_SYSTEM_PROMPT).toMatch(/abstract noun/i);
  });

  it("encodes the depth budget per NPS score band", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Depth budget/);
    expect(V2_SYSTEM_PROMPT).toMatch(/9.10.*PROMOTER/);
    expect(V2_SYSTEM_PROMPT).toMatch(/7.8.*PASSIVE/);
    expect(V2_SYSTEM_PROMPT).toMatch(/0.6.*DETRACTOR/);
  });

  it("encodes the forbidden-easy-answers list with re-asks", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Forbidden easy answers/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Better communication/);
    expect(V2_SYSTEM_PROMPT).toMatch(/More responsive/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Pretty good/);
  });

  it("includes sensitive-topic guidance for legal mentions", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Sensitive topics/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Legal.*litigation.*attorney/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Race, gender, identity/);
  });

  it("forbids identifying as an AI persona by name", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Never identify yourself by an AI persona name/);
  });

  it("is differentiated from V1", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V1_SYSTEM_PROMPT);
    // V1 introduces itself as "a friendly, professional data scientist".
    // V2 rejects that framing — the only mention of "data scientist" should
    // be the explicit "not a data scientist" disclaimer.
    expect(V2_SYSTEM_PROMPT).not.toMatch(/professional data scientist/i);
    expect(V2_SYSTEM_PROMPT).toMatch(/not a data scientist/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// V2.1 changes — forbidden first-sentence openers + post-NPS example +
// oblique-history rule. Live testing on staging showed Claude Haiku 4.5
// routinely opening replies with "Thanks for that…" and meta-narrating
// prior session context ("I see you've been frustrated with…"), both of
// which V2.0 forbade abstractly but never named explicitly.
// ──────────────────────────────────────────────────────────────────────────
describe("V2 system prompt — V2.1 anti-preamble hardening", () => {
  it("V2_SYSTEM_PROMPT_V20 is preserved byte-perfect for migration matching", () => {
    // V20 was the value seeded by the original 2026-04-30 migration. The
    // V20 → V21 migration matches against this exact string, so any
    // accidental drift (e.g. an editor changing a smart quote, or a stray
    // space) would silently stop catching stale rows.
    expect(V2_SYSTEM_PROMPT_V20.length).toBeGreaterThan(5500);
    expect(V2_SYSTEM_PROMPT_V20).toMatch(/curious journalist/);
    expect(V2_SYSTEM_PROMPT_V20).toMatch(/Anti-abstraction rule/);
    // V20 did NOT contain the new V2.1 sections — that's how we tell them
    // apart for migration purposes.
    expect(V2_SYSTEM_PROMPT_V20).not.toMatch(/Forbidden first-sentence openers/);
    expect(V2_SYSTEM_PROMPT_V20).not.toMatch(/Worked example: the post-NPS opener/);
    expect(V2_SYSTEM_PROMPT_V20).not.toMatch(/Referencing prior context/);
  });

  it("V21 differs from V20 (so the migration's exact-equality check separates them)", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V20);
  });

  it("V21 names the actual forbidden first-sentence phrases, not just the abstract rule", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Forbidden first-sentence openers/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"Thanks for that/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"That's helpful/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"I appreciate/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"I see you've/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"Looking at your history/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"It sounds like/);
  });

  it("V21 includes the gold-standard post-NPS opener example from the design prototype", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Worked example: the post-NPS opener/);
    expect(V2_SYSTEM_PROMPT).toMatch(/A 6 — honest answer/);
    expect(V2_SYSTEM_PROMPT).toMatch(/biggest thing standing between you and a higher score/);
    // And calls out what NOT to look like:
    expect(V2_SYSTEM_PROMPT).toMatch(/MUST NOT look like/);
    expect(V2_SYSTEM_PROMPT).toMatch(/that's helpful to know upfront/i);
  });

  it("V21 contains the oblique-history rule (no meta-narration of prior context)", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Referencing prior context/);
    expect(V2_SYSTEM_PROMPT).toMatch(/NEVER meta-narrate/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Weave the context INTO the question/);
    expect(V2_SYSTEM_PROMPT).toMatch(/ONE prior thread per turn/);
  });

  it("V21 reinforces the 2-sentence cap as a self-check before sending", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Before sending each reply, run this self-check/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Did I use more than 2 sentences/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Did my first sentence soften, thank, validate/);
  });

  it("V21 extends the 'never do' list with the new forbidden-opener and meta-narration rules", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(
      /Never open a reply with a thanks\/validation\/meta-comment phrase/
    );
    expect(V2_SYSTEM_PROMPT).toMatch(/Never meta-narrate prior context/);
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
