import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level guards for the chat route file.
 *
 * Same structural-guard pattern used elsewhere in the route tests —
 * grep the source for the contracts that must hold. Catches the
 * regressions that bit us in V2.x: hardcoded thresholds, missing
 * tag parsing, untyped session updates.
 */
describe("chat route — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "chat.js"), "utf8");
  });

  it("reads google_review_threshold from settings (not hardcoded)", () => {
    expect(source).toMatch(/google_review_threshold/);
    expect(source).toMatch(/threshold = thresholdSetting \? Number\(thresholdSetting\.value\) : 9/);
  });

  it("promoter fast-path uses the configurable threshold", () => {
    // The qualifying check should be against the loaded threshold,
    // not a hardcoded >= 9 anywhere in the review block.
    const block = source.slice(
      source.indexOf("Google review fast-path"),
      source.indexOf("Check for prior sessions")
    );
    expect(block).toMatch(/qualifies = session\.nps_score >= threshold/);
    // No literal "nps_score >= 9" left in the block
    expect(block).not.toMatch(/nps_score >= 9/);
  });

  it("promoter fast-path prompt includes the actual threshold value (interpolated)", () => {
    const block = source.slice(
      source.indexOf("GOOGLE REVIEW PROMOTER FAST-PATH"),
      source.indexOf("Check for prior sessions")
    );
    expect(block).toMatch(/at or above the \$\{threshold\} threshold/);
  });

  it("promoter fast-path instructs the AI on the [CHAT:END] tag", () => {
    expect(source).toMatch(/CHAT:END/);
    expect(source).toMatch(/auto-closes the chat 3 seconds later/i);
  });

  it("[CHAT:END] tag is parsed, stripped, and surfaces as chat_end:true in the response", () => {
    expect(source).toMatch(/\\\[CHAT:\\s\*END\\s\*\\\]/);
    expect(source).toMatch(/let chatEnd = false/);
    expect(source).toMatch(/chatEnd = true/);
    expect(source).toMatch(/chat_end: chatEnd/);
  });

  it("[REVIEW:YES|NO] tag is still parsed and persisted to sessions.google_review_response", () => {
    expect(source).toMatch(/\\\[REVIEW:\\s\*\(YES\|NO\)\\s\*\\\]/);
    expect(source).toMatch(/UPDATE sessions SET google_review_response/);
  });

  it("system prompt is scoped by client_id (per-client override), key chosen per session", () => {
    // V4 hybrid ship: template sessions read 'system_prompt_hybrid',
    // legacy sessions 'system_prompt' — both still client-scoped first.
    expect(source).toMatch(/"system_prompt_hybrid" : "system_prompt"/);
    expect(source).toMatch(/WHERE key = \? AND client_id = \?/);
  });

  it("interview_prompt_supplement is appended when present (per-client brief)", () => {
    expect(source).toMatch(/interview_prompt_supplement/);
    expect(source).toMatch(/ADDITIONAL CLIENT CONTEXT/);
  });
});
