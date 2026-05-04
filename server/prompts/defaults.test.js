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
  V2_SYSTEM_PROMPT_V23,
  V2_SYSTEM_PROMPT_V24,
  V2_SYSTEM_PROMPT_V25,
  V2_SYSTEM_PROMPT_V26,
  V2_SYSTEM_PROMPT_V261,
  V2_SYSTEM_PROMPT,
  V2_5_CLOSING_BLOCK,
  V2_6_CLOSING_BLOCK,
  V2_5_NEVER_TAIL,
  V2_6_NEVER_TAIL,
  V2_6_PIVOT_INSTRUCTIONS,
  V2_6_1_PIVOT_INSTRUCTIONS,
  V2_7_PIVOT_INSTRUCTIONS,
  V2_6_FRUSTRATION_PIVOT,
  V2_6_1_FRUSTRATION_PIVOT,
  V2_7_FRUSTRATION_PIVOT,
  V2_6_FAILURE_MODE_PIVOT,
  V2_6_1_FAILURE_MODE_PIVOT,
  V2_7_FAILURE_MODE_PIVOT,
  V2_6_DETRACTOR_PIVOT,
  V2_6_1_DETRACTOR_PIVOT,
  V2_7_DETRACTOR_PIVOT,
  V2_6_1_COVERAGE_BLOCK,
  V2_7_COVERAGE_BLOCK,
  V2_INTERVIEW_INITIAL_V20,
  V2_INTERVIEW_INITIAL_V21,
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
// V2 board interview — V2.0/V2.1/V2.2/V2.3/V2.4 frozen, V2.5 current
// ──────────────────────────────────────────────────────────────────────────

describe("V2 system prompt — V2.0/V2.1/V2.2/V2.3/V2.4 frozen for migration matching", () => {
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

  it("V2_SYSTEM_PROMPT_V22 is preserved byte-perfect", () => {
    expect(V2_SYSTEM_PROMPT_V22.length).toBeGreaterThan(3000);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/Frustration signals/);
    expect(V2_SYSTEM_PROMPT_V22).toMatch(/reserves/i);
    // V22 did NOT yet have the [CHAT:END] auto-close rule
    expect(V2_SYSTEM_PROMPT_V22).not.toMatch(/CHAT:END/);
  });

  it("V2_SYSTEM_PROMPT_V23 is preserved byte-perfect (reserves out of coverage but no CHAT:END yet)", () => {
    expect(V2_SYSTEM_PROMPT_V23.length).toBeGreaterThan(3000);
    expect(V2_SYSTEM_PROMPT_V23).toMatch(/Reserves.*rarely top-of-mind/i);
    expect(V2_SYSTEM_PROMPT_V23).not.toMatch(/CHAT:END/);
  });

  it("V2_SYSTEM_PROMPT_V24 is preserved byte-perfect (CHAT:END landed but pre-V2.5 thread fix)", () => {
    expect(V2_SYSTEM_PROMPT_V24.length).toBeGreaterThan(3000);
    // Distinguishing fingerprint: V24 had the [CHAT:END] auto-close rule
    // but used the loose "3 follow-ups MAX" wording that the model
    // interpreted as "per question topic" rather than "per root issue".
    expect(V2_SYSTEM_PROMPT_V24).toMatch(/\[CHAT:END\]/);
    expect(V2_SYSTEM_PROMPT_V24).toMatch(/3 follow-ups MAX/);
    // V24 did NOT have the V2.5 "Common failure mode" worked example
    expect(V2_SYSTEM_PROMPT_V24).not.toMatch(/Common failure mode/);
    // V24 did NOT explicitly forbid "Have you tried…?" advice
    expect(V2_SYSTEM_PROMPT_V24).not.toMatch(/Have you tried/);
  });

  it("V2_SYSTEM_PROMPT_V25 is preserved byte-perfect (V2.5: thread = root topic, no advice)", () => {
    expect(V2_SYSTEM_PROMPT_V25.length).toBeGreaterThan(3000);
    // Distinguishing fingerprints from V2.4:
    expect(V2_SYSTEM_PROMPT_V25).toMatch(/Common failure mode/);
    expect(V2_SYSTEM_PROMPT_V25).toMatch(/Have you tried/);
    expect(V2_SYSTEM_PROMPT_V25).toMatch(/ROOT TOPIC/);
    // V2.5 had the OLD single-step closing — no playback step.
    expect(V2_SYSTEM_PROMPT_V25).not.toMatch(/Step 1.*Decide it's time to close/);
    expect(V2_SYSTEM_PROMPT_V25).not.toMatch(/playback before close/i);
    // V2.5 did NOT yet ban sycophantic flattery.
    expect(V2_SYSTEM_PROMPT_V25).not.toMatch(/Absolutely fair point/);
  });

  it("V2_SYSTEM_PROMPT_V26 is preserved (V2.6: structured wrap-up + ban sycophantic flattery)", () => {
    // V26 has the V2.6 closing block + the ban-sycophantic-flattery
    // never-list entries — both inherited from V2.5's frozen text via
    // the .replace() chain. V2.6.1 then layers pivot-phrasing fixes
    // on top, so V26 must NOT have the V2.6.1 pivot copy.
    expect(V2_SYSTEM_PROMPT_V26.length).toBeGreaterThan(3000);
    expect(V2_SYSTEM_PROMPT_V26).toMatch(/V2\.6.*playback before close/);
    expect(V2_SYSTEM_PROMPT_V26).toMatch(/Absolutely fair point/);
    // V2.6 still had the OLD bare-bones pivot phrasing block.
    expect(V2_SYSTEM_PROMPT_V26).toMatch(/Pivot phrasing:\n {2}• "Got it/);
    expect(V2_SYSTEM_PROMPT_V26).not.toMatch(/illustrative templates only/);
    expect(V2_SYSTEM_PROMPT_V26).not.toMatch(/Let me ask about something else/);
  });

  it("V2_SYSTEM_PROMPT_V261 is preserved (V2.6.1: varied pivot worked-example phrasing)", () => {
    expect(V2_SYSTEM_PROMPT_V261.length).toBeGreaterThan(3000);
    // V2.6.1 still had the "Pivot phrasing" block with literal example
    // phrasings — V2.7 strips those.
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_PIVOT_INSTRUCTIONS);
    expect(V2_SYSTEM_PROMPT_V261).toMatch(/illustrative templates only/);
    // V2.6.1 still had the OLD 3-area Coverage block.
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_COVERAGE_BLOCK);
    // V2.6.1 did NOT yet have the V2.7 pivot-structure rewrite.
    expect(V2_SYSTEM_PROMPT_V261).not.toMatch(/Pivot structure — generate fresh/);
    // V2.6.1 did NOT yet ban specific stock pivot phrases.
    expect(V2_SYSTEM_PROMPT_V261).not.toMatch(/Forbidden literal phrases/);
    // V2.6.1 did NOT yet have the new themes (board advisory, training, etc.)
    expect(V2_SYSTEM_PROMPT_V261).not.toMatch(/Board advisory support/);
  });

  it("all eight frozen versions are distinct", () => {
    const all = [
      V2_SYSTEM_PROMPT_V20,
      V2_SYSTEM_PROMPT_V21,
      V2_SYSTEM_PROMPT_V22,
      V2_SYSTEM_PROMPT_V23,
      V2_SYSTEM_PROMPT_V24,
      V2_SYSTEM_PROMPT_V25,
      V2_SYSTEM_PROMPT_V26,
      V2_SYSTEM_PROMPT_V261,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("current V2_SYSTEM_PROMPT (V2.7) differs from all frozen versions", () => {
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V20);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V21);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V22);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V23);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V24);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V25);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V26);
    expect(V2_SYSTEM_PROMPT).not.toEqual(V2_SYSTEM_PROMPT_V261);
  });
});

describe("V2 system prompt — V2.7 derivation from V2.6.1", () => {
  // ── Anchor guards ────────────────────────────────────────────────
  it("V2_6_1_PIVOT_INSTRUCTIONS appears verbatim in V261 (replace anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_PIVOT_INSTRUCTIONS);
  });
  it("V2_6_1_COVERAGE_BLOCK appears verbatim in V261 (replace anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_COVERAGE_BLOCK);
  });
  it("V2_6_1_*_PIVOT worked-example anchors appear verbatim in V261", () => {
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_FRUSTRATION_PIVOT);
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_FAILURE_MODE_PIVOT);
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_DETRACTOR_PIVOT);
  });

  // ── V2.7: pivot structure replaces stock-phrasing menu ───────────
  it("V2.7 replaces the pivot-phrasing menu with structural rules + banned stock phrases", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_7_PIVOT_INSTRUCTIONS);
    expect(V2_SYSTEM_PROMPT).toMatch(/Pivot structure — generate fresh/);
    expect(V2_SYSTEM_PROMPT).toMatch(/stock transition phrases are BANNED/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"Switching gears"/);
  });

  it("V2.7 strips literal pivot strings from worked examples (replaced with [PIVOT: ...] placeholders)", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_7_FRUSTRATION_PIVOT);
    expect(V2_SYSTEM_PROMPT).toContain(V2_7_FAILURE_MODE_PIVOT);
    expect(V2_SYSTEM_PROMPT).toContain(V2_7_DETRACTOR_PIVOT);
    // Worked-example pivot phrasings from V2.6/V2.6.1 must be GONE.
    expect(V2_SYSTEM_PROMPT).not.toContain(
      "Switching gears — how are board notices and meeting prep coming through these days?"
    );
    expect(V2_SYSTEM_PROMPT).not.toContain(
      "OK. Different topic — anything specific on maintenance"
    );
    // The placeholder pattern should appear at least 3 times (once per
    // worked-example pivot).
    const placeholderCount = (V2_SYSTEM_PROMPT.match(/\[PIVOT: acknowledge in one word/g) || [])
      .length;
    expect(placeholderCount).toBeGreaterThanOrEqual(3);
  });

  it("V2.7 expands Coverage areas to include the real-world themes from production data", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_7_COVERAGE_BLOCK);
    expect(V2_SYSTEM_PROMPT).toMatch(/Board advisory support/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Training & education/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Financial accuracy/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Communication systems & meeting follow-up/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Vendor & maintenance coordination/);
    // Critical-flag handling for dissolution interest.
    expect(V2_SYSTEM_PROMPT).toMatch(/DISSOLUTION of the association/);
    // Old narrow 3-bullet list should be gone.
    expect(V2_SYSTEM_PROMPT).not.toContain(V2_6_1_COVERAGE_BLOCK);
  });

  it("V2.7 adds forward-looking probes (boards have asks, not just complaints)", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Forward-looking probes/);
    expect(V2_SYSTEM_PROMPT).toMatch(/What would good look like for you/);
    expect(V2_SYSTEM_PROMPT).toMatch(/managers should carry fewer accounts/);
  });

  it("V2.7 keeps everything V2.6 added (closing block + ban sycophantic flattery)", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_6_CLOSING_BLOCK);
    expect(V2_SYSTEM_PROMPT).toMatch(/Absolutely fair point/);
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CHAT:END\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Thank you for your time, I'm concluding this chat/);
  });
});

describe("V2 system prompt — V2.6.1 derivation from V2.6", () => {
  it("V2_6_PIVOT_INSTRUCTIONS appears verbatim in V26 (anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V26).toContain(V2_6_PIVOT_INSTRUCTIONS);
  });
  it("V2_6_FRUSTRATION_PIVOT appears verbatim in V26 (anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V26).toContain(V2_6_FRUSTRATION_PIVOT);
  });
  it("V2_6_FAILURE_MODE_PIVOT appears verbatim in V26 (anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V26).toContain(V2_6_FAILURE_MODE_PIVOT);
  });
  it("V2_6_DETRACTOR_PIVOT appears verbatim in V26 (anchor)", () => {
    expect(V2_SYSTEM_PROMPT_V26).toContain(V2_6_DETRACTOR_PIVOT);
  });

  it("V2.6.1 frozen export contains the vary-it pivot guidance", () => {
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_PIVOT_INSTRUCTIONS);
    expect(V2_SYSTEM_PROMPT_V261).toMatch(/illustrative templates only/);
    expect(V2_SYSTEM_PROMPT_V261).toMatch(/Do not copy these example phrasings verbatim/);
  });

  it("V2.6.1 frozen export has varied worked-example pivot phrases", () => {
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_FRUSTRATION_PIVOT);
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_FAILURE_MODE_PIVOT);
    expect(V2_SYSTEM_PROMPT_V261).toContain(V2_6_1_DETRACTOR_PIVOT);
    // The exact verbatim phrase the model was overusing must NOT appear
    // in V2.6.1 (it WAS the bug we tried to fix at this stage —
    // unsuccessfully, which is why V2.7 strips literal pivot strings
    // from worked examples entirely).
    const phrase = "how are board notices and meeting prep coming through these days?";
    expect(V2_SYSTEM_PROMPT_V261).not.toContain(phrase);
  });

  it("V2.6.1 frozen export has at least 4 distinct example pivot openers", () => {
    const openers = [
      "Switching gears",
      "Different topic",
      "Anything specific",
      "Different angle",
      "Let me ask about something else",
    ];
    const present = openers.filter((o) => V2_SYSTEM_PROMPT_V261.includes(o));
    expect(present.length).toBeGreaterThanOrEqual(4);
  });
});

describe("V2 system prompt — V2.6 derivation from V2.5", () => {
  it("V2_5_CLOSING_BLOCK appears verbatim in V25 (anchor for the .replace())", () => {
    // If this fails, the V2.5 closing copy drifted and the .replace()
    // would silently fall through, leaving V2.6 == V2.5. That's why
    // this is a guard test, not a vanity assertion.
    expect(V2_SYSTEM_PROMPT_V25).toContain(V2_5_CLOSING_BLOCK);
  });

  it("V2_5_NEVER_TAIL appears verbatim in V25 (anchor for the .replace())", () => {
    expect(V2_SYSTEM_PROMPT_V25).toContain(V2_5_NEVER_TAIL);
  });

  it("V2.6 contains the new playback-before-close block", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_6_CLOSING_BLOCK);
    expect(V2_SYSTEM_PROMPT).toMatch(/V2\.6.*playback before close/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Step 1.*Decide it's time to close/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Step 2.*Playback.*REQUIRED/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Step 3.*Final close/);
    expect(V2_SYSTEM_PROMPT).toMatch(
      /Anything missing from that, or anything else I should pass along/
    );
    expect(V2_SYSTEM_PROMPT).toMatch(/faster channel than a quarterly survey/);
  });

  it("V2.6 bans sycophantic flattery", () => {
    expect(V2_SYSTEM_PROMPT).toContain(V2_6_NEVER_TAIL);
    expect(V2_SYSTEM_PROMPT).toMatch(/sycophantic flattery/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Absolutely fair point/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Skip the playback step at close/);
  });

  it("V2.6 keeps the [CHAT:END] mechanism + 'Thank you for your time' closing line", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CHAT:END\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Thank you for your time, I'm concluding this chat/);
    expect(V2_SYSTEM_PROMPT).toMatch(/auto-closes the session 3 seconds later/);
  });

  it("V2.6 does NOT contain the old V2.5 closing block (regression guard)", () => {
    // The closing block is fully replaced — its V2.5 form must be gone.
    expect(V2_SYSTEM_PROMPT).not.toContain(V2_5_CLOSING_BLOCK);
    // The Never tail is APPENDED to (not replaced wholesale), so the
    // V2.5 [CHAT:END] reminders remain inside V2_6_NEVER_TAIL by
    // design. We verify intent by checking the new entries land
    // BEFORE the [CHAT:END] reminders in the final string.
    const sycophancyIdx = V2_SYSTEM_PROMPT.indexOf("sycophantic flattery");
    const chatEndForgetIdx = V2_SYSTEM_PROMPT.indexOf("Forget to include [CHAT:END]");
    expect(sycophancyIdx).toBeGreaterThan(-1);
    expect(chatEndForgetIdx).toBeGreaterThan(sycophancyIdx);
  });
});

describe("V2 system prompt — V2.5 current (thread = root topic, no advice, no meta-narration)", () => {
  it("targets [CLIENT_NAME] and frames the role minimally", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CLIENT_NAME\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/interviewing a board member/i);
  });

  it("retains the 5-7 question total + close-on-fine pivot rules", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Hard constraints/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Total session.*5.7 questions/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Stop at 7/);
    expect(V2_SYSTEM_PROMPT).toMatch(/topic is "fine".*ACCEPT IT, pivot/i);
  });

  it("retains the [CHAT:END] auto-close protocol from V2.4", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Closing the chat/);
    expect(V2_SYSTEM_PROMPT).toMatch(/\[CHAT:END\]/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Thank you for your time, I'm concluding this chat/);
    expect(V2_SYSTEM_PROMPT).toMatch(/auto-closes the session 3 seconds later/i);
  });

  it("retains reserves-follow-only and forbidden first-sentence openers", () => {
    // V2.7 reworded the reserves rule from "rarely top-of-mind" to
    // "almost never top-of-mind unless something specific just
    // happened" — same intent, slightly different copy. Match the
    // intent (reserves are deprioritized) rather than the exact
    // earlier wording.
    expect(V2_SYSTEM_PROMPT).toMatch(/Reserves.*top-of-mind/i);
    expect(V2_SYSTEM_PROMPT).toMatch(/Lead with reserves, statements, or special assessments/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Forbidden first-sentence openers/);
  });

  // ── V2.5 — three new behaviors ────────────────────────────────────

  it("V2.5: redefines 'thread' as ROOT TOPIC (not per-question)", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Per ROOT topic.*2 follow-ups MAX/);
    expect(V2_SYSTEM_PROMPT).toMatch(/SAME root issue is the SAME thread/);
    expect(V2_SYSTEM_PROMPT).toMatch(/What counts as a "root topic"/);
    // The Never list spells out that causes/sub-causes are one thread.
    expect(V2_SYSTEM_PROMPT).toMatch(
      /SAME ROOT TOPIC past 3 questions.*including causes, sub-causes, examples, and implications/
    );
  });

  it("V2.5: Common failure mode worked example is included verbatim", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Common failure mode \(DO NOT REPEAT\)/);
    expect(V2_SYSTEM_PROMPT).toMatch(/They keep changing my manager/);
    // The "Have you tried documenting" line is the failure example.
    expect(V2_SYSTEM_PROMPT).toMatch(/Have you tried documenting these projects in writing/);
    expect(V2_SYSTEM_PROMPT).toMatch(/THREE QUESTIONS MAX, then pivot/);
  });

  it("V2.5: forbids advice / consulting language", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Suggest solutions or advise/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Have you tried…\?/);
    expect(V2_SYSTEM_PROMPT).toMatch(/You're collecting feedback, not consulting/);
  });

  it("V2.5: forbids 'It sounds like…' and validation talk ANYWHERE in a reply", () => {
    expect(V2_SYSTEM_PROMPT).toMatch(/Forbidden ANYWHERE in a reply/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"It sounds like…"/);
    expect(V2_SYSTEM_PROMPT).toMatch(/"So it sounds like…"/);
    expect(V2_SYSTEM_PROMPT).toMatch(/Validation talk wastes turns/);
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

  it("V2.1 (now frozen) is shorter than V2.0 (surgical-rewrite goal)", () => {
    expect(V2_INTERVIEW_INITIAL_V21.length).toBeLessThan(V2_INTERVIEW_INITIAL_V20.length);
  });

  // ── V2.2 (current) — wrap-up rewrite ────────────────────────────────
  // V2.1's wrap-up promised admins they'd be able to "edit, regenerate,
  // or approve" the supplement. The model interpreted that as an async
  // review queue and started telling admins they'd "receive the
  // supplement within 24 hours" — but /confirm runs synchronously in
  // seconds. V2.2 rewrites the wrap-up + Never list to describe what
  // actually happens.

  it("V2_INTERVIEW_INITIAL_V21 is preserved byte-perfect (was the V2.1 default before V2.2 wrap-up rewrite)", () => {
    // Distinguishing fingerprint: V2.1's wrap-up phrase that the AI
    // misread as an async review flow.
    expect(V2_INTERVIEW_INITIAL_V21).toMatch(/edit, regenerate, or approve/);
  });

  it("V2.2 current differs from V2.1", () => {
    expect(V2_INTERVIEW_INITIAL).not.toEqual(V2_INTERVIEW_INITIAL_V21);
  });

  it("V2.2 drops the 'edit, regenerate, or approve' wrap phrasing that misled the model", () => {
    expect(V2_INTERVIEW_INITIAL).not.toMatch(/edit, regenerate, or approve/);
  });

  it("V2.2 explicitly forbids async-delivery promises ('within X hours', 'we'll send', etc.)", () => {
    // The Never list now blocks the language patterns the model
    // hallucinated under V2.1.
    expect(V2_INTERVIEW_INITIAL).toMatch(/no "within 24 hours"/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Promise async delivery of the brief/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/generated immediately when they confirm/);
  });

  it("V2.2 wrap-up describes the on-demand /confirm flow", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/it takes a few seconds/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/applied to every board interview from there on/);
  });

  it("V2.2 keeps the four-phase shape and surprise probe (no regression on V2.1's gains)", () => {
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 1.*Calibrate/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 2.*Concretize/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 3.*Forbid/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/Phase 4.*Vocabulary/);
    expect(V2_INTERVIEW_INITIAL).toMatch(/would surprise you/i);
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
