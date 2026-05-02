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
  V2_SYSTEM_PROMPT_V22,
  V2_SYSTEM_PROMPT,
  V2_INTERVIEW_INITIAL_V20,
  V2_INTERVIEW_INITIAL,
  V2_PROMPT_GENERATION_V20,
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

// ──────────────────────────────────────────────────────────────────────────
// V2 board interview — V2.0/V2.1/V2.2 frozen, V2.3 current
// ──────────────────────────────────────────────────────────────────────────

describe("V2 system prompt — V2.0/V2.1/V2.2 frozen for migration matching", () => {
  it("V2_SYSTEM_PROMPT_V20 is preserved byte-perfect", () => {
    expect(V2_SYSTEM_PROMPT_V20.length).toBeGreaterThan(5500);
    expect(V2_SYSTEM_PROMPT_V20).toMatch(/curious journalist/);
    expect(V2_SYSTEM_PROMPT_V20).not.toMatch(/Forbidden first-sentence openers/);
  });

  it("V2_SYSTEM_PROMPT_V21 is preserved byte-perfect", () => {
    expect(V2_SYSTEM_PROMPT_V21.length).toBeGreaterThan(5500);
    expect(V2_SYSTEM_PROMPT_V21).toMatch(/Forbidden first-sentence openers/);
    expect(V2_SYSTEM_PROMPT_V21).not.toMatch(/Hard constraints/);
  });

  it("V2_SYSTEM_PROMPT_V22 is preserved byte-perfect (had hard caps but still listed reserves)", () => {
    expect(V2_SYSTEM_PROMPT_V22.length).toBeGreaterThan(3000);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/Frustration signals/);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/reserves/i); // V2.2 still mentioned reserves
  });

  it("all three frozen versions are distinct", () => {
    const all = [V2_SYSTEM_PROMPT_V20, V2_SYSTEM_PROMPT_V21, V2_SYSTEM_PROMPT_V22];
    expect(new Set(all).size).toBe(all.length);
  });

  it("current V2_SYSTEM_PROMPT (V2.3) differs from all frozen versions", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V20);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V21);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V22);
  });
});

describe("V2 system prompt — V2.3 current (reserves removed, accept-fine rule)", () => {
  it("targets [CLIENT_NAME] and frames the role minimally", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CLIENT_NAME\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/interviewing a board member/i);
  });

  it("retains hard constraints from V2.2 (5-7 question cap, 3 per thread)", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Total session.*5.7 questions/);
    expect(V2_SYSTEM_PROMPT).toMatch(/3 follow-ups MAX/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Stop at 7/);
  });

  it("retains thread completion checklist + frustration signals", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Thread completion/);
    expect(V2_SYSTEM_PROMPT).toMatch(/INCIDENT/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Frustration signals/);
    expect(V2_SYSTEM_PROMPT).toMatch(/just what I mentioned above/i);
  });

  it("NEW: codifies the 'if a topic is fine, accept and pivot' rule", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/topic is "fine".*ACCEPT IT, pivot/i);
    expect(V2_SYSTEM_PROMPT).toMatch(
      /A thread is also COMPLETE when the resident says it's not a concern/i
    );
  });

  it("NEW: removes reserves from coverage areas, makes financials follow-only", () => {
    // The coverage areas list should NOT include reserves as a probe target
    expect(V2_SYSTEM_PROMPT).not.toMatch(/Coverage areas[\s\S]*?Financial transparency.*reserves/);
    // The follow-only block should explicitly call out reserves
    expect(V2_SYSTEM_PROMPT).toMatch(/Reserves.*rarely top-of-mind/i);
    expect(V2_SYSTEM_PROMPT).toMatch(/Do NOT lead with these/);
  });

  it("NEW: Never list explicitly forbids leading with reserves/statements/assessments", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Lead with reserves, statements, or special assessments/);
  });

  it("retains the post-NPS gold-standard opener and detractor worked example", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/A 6 — honest answer/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Worked example: detractor done right/);
    expect(V2_SYSTEM_PROMPT).toMatch(/sprinklers/i);
  });

  it("is differentiated from V1 (no 'data scientist' framing)", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V1_SYSTEM_PROMPT);
    expect(V2_SYSTEM_PROMPT).not.toMatch(/professional data scientist/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// V2 client onboarding interview — V2.0 frozen, V2.1 current
// ──────────────────────────────────────────────────────────────────────────

describe("V2 onboarding interview — V2.0 frozen + V2.1 current", () => {
  it("V2_INTERVIEW_INITIAL_V20 is preserved byte-perfect (had senior-consultant persona buildup)", () => {
    expect(V2_INTERVIEW_INITIAL_V20).toMatch(/senior consultant/i);
    expect(V2_INTERVIEW_INITIAL_V20).toMatch(/200\+ residential management companies/);
  });

  it("V2.1 current differs from V2.0", () => {
    expect(V2_INTERVIEW_INITIAL).not.toEqual(V2_INTERVIEW_INITIAL_V20);
  });

  it("V2.1 drops the persona-buildup prelude", () => {
    expect(V2_INTERVIEW_INITIAL).not.toMatch(/senior consultant/i);
    expect(V2_INTERVIEW_INITIAL).not.toMatch(/200\+ residential management companies/);
  });

  it("V2.1 declares hard constraints (10-12 questions, 1-2 sentences, 1 question per reply)", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Hard constraints/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/10.12 questions/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Stop at 12/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/One question per reply/);
  });

  it("V2.1 retains the four-phase structure", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 1.*Calibrate/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 2.*Concretize/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 3.*Forbid/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 4.*Vocabulary/);
  });

  it("V2.1 retains the surprise-probe question (gold for the supplement)", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/would surprise you/i);
  });

  it("V2.1 retains the mid-interview priority confirmation", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Mid-interview confirmation/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/biggest priority this quarter/);
  });

  it("V2.1 is shorter than V2.0 (surgical-rewrite goal)", () => {
    expect(V2_INTERVIEW_INITIAL.length).toBeLessThan(V2_INTERVIEW_INITIAL_V20.length);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// V2 supplement generator — V2.0 frozen, V2.1 current
// ──────────────────────────────────────────────────────────────────────────

describe("V2 supplement generator — V2.0 frozen + V2.1 current", () => {
  it("V2_PROMPT_GENERATION_V20 is preserved byte-perfect (had Quality bar section)", () => {
    expect(V2_PROMPT_GENERATION_V20).toMatch(/Quality bar/);
  });

  it("V2.1 current differs from V2.0", () => {
    expect(V2_PROMPT_GENERATION).not.toEqual(V2_PROMPT_GENERATION_V20);
  });

  it("V2.1 drops the Quality bar philosophical section", () => {
    expect(V2_PROMPT_GENERATION).not.toMatch(/Quality bar/);
  });

  it("V2.1 retains the required output structure verbatim", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/Required output/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Company Context/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Priority Probes/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Forbidden Easy Answers/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Sensitive Topics/);
    expect(V2_PROMPT_GENERATION).toMatch(/## Client Vocabulary/);
    expect(V2_PROMPT_GENERATION).toMatch(/## What Would Surprise Them/);
  });

  it("V2.1 retains script + follow_up structure for priority probes", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/SCRIPT:/);
    expect(V2_PROMPT_GENERATION).toMatch(/FOLLOW_UP_IF_VAGUE:/);
  });

  it("V2.1 retains the 600-word cap", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/600 words/);
  });

  it("V2.1 retains re-interview diff behavior", () => {
    expect(V2_PROMPT_GENERATION).toMatch(/RE-INTERVIEW/);
    expect(V2_PROMPT_GENERATION).toMatch(/Output a DIFF/);
  });

  it("V2.1 is shorter than V2.0", () => {
    expect(V2_PROMPT_GENERATION.length).toBeLessThan(V2_PROMPT_GENERATION_V20.length);
  });
});
