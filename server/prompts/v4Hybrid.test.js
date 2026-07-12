import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { V4_SYSTEM_PROMPT, V4_SYSTEM_PROMPT_BLOCKS, V2_SYSTEM_PROMPT } from "./defaults.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// V4 is the HYBRID interview prompt (template sessions): the AI is the
// conversational depth layer, widgets own measurement. These tests pin
// the contract — especially the subtractions from V3.2, which are the
// point of the redesign.

describe("V4 hybrid prompt — content contract", () => {
  it("is roughly HALF of V3.2 — measurement moved to the catalog", () => {
    expect(V4_SYSTEM_PROMPT.length).toBeLessThan(V2_SYSTEM_PROMPT.length * 0.6);
    expect(V4_SYSTEM_PROMPT.length).toBeGreaterThan(2000);
  });

  it("forbids the AI from asking for numeric ratings — the system owns scales", () => {
    expect(V4_SYSTEM_PROMPT).toMatch(/NEVER ask the resident to rate, score, or quantify/);
    expect(V4_SYSTEM_PROMPT).toMatch(/the system presents rating scales/);
  });

  it("teaches the model to READ bracketed widget answers and react, never re-ask", () => {
    expect(V4_SYSTEM_PROMPT).toMatch(/\[Manager overall performance: 2\/5\]/);
    expect(V4_SYSTEM_PROMPT).toMatch(
      /NEVER re-ask a dimension that already has a bracketed answer/
    );
    expect(V4_SYSTEM_PROMPT).toMatch(/a 1 or 2 deserves ONE follow-up/);
  });

  it("has NO closing section — the close is fully server-driven", () => {
    expect(V4_SYSTEM_PROMPT).not.toMatch(/## Closing/);
    expect(V4_SYSTEM_PROMPT).not.toMatch(/Thank you for your time/);
    expect(V4_SYSTEM_PROMPT).toMatch(/The system decides when the interview ends/);
  });

  it("has NO coverage-areas section — the question catalog owns coverage", () => {
    expect(V4_SYSTEM_PROMPT).not.toMatch(/## Coverage areas/);
  });

  it("carries forward the battle-tested pieces from V3.2", () => {
    // The drill-on-specifics principle (V3.2's key win)
    expect(V4_SYSTEM_PROMPT).toMatch(/## Drill on specifics, don't broaden/);
    expect(V4_SYSTEM_PROMPT).toMatch(/Re-broadening to abstract themes IS a pivot/);
    // Sycophancy bans
    expect(V4_SYSTEM_PROMPT).toMatch(/Forbidden phrases/);
    // Score-specific opener + capture-only + prior context
    expect(V4_SYSTEM_PROMPT).toMatch(/Score-specific opener/);
    expect(V4_SYSTEM_PROMPT).toMatch(/DISSOLUTION of the association/);
    expect(V4_SYSTEM_PROMPT).toMatch(/Prior context/);
  });

  it("does NOT contain [ASK:code] weave-in instructions — appended at runtime", () => {
    expect(V4_SYSTEM_PROMPT).not.toMatch(/\[ASK:/);
  });

  it("parses into blocks for the SuperAdmin editor", () => {
    expect(V4_SYSTEM_PROMPT_BLOCKS.length).toBeGreaterThanOrEqual(6);
  });
});

describe("chat.js hybrid selection — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("template sessions read system_prompt_hybrid; legacy read system_prompt", () => {
    expect(source).toMatch(
      /session\.template_version_id \? "system_prompt_hybrid" : "system_prompt"/
    );
  });

  it("falls back to the V4 code default so templates work without a settings row", () => {
    expect(source).toMatch(/session\.template_version_id \? V4_SYSTEM_PROMPT :/);
  });

  it("widget turns don't consume the interview budget", () => {
    expect(source).toMatch(/m\.role === "assistant" && \(m\.message_type \?\? "text"\) === "text"/);
  });

  it("hybrid manager context stops instructing a conversational dimension sweep", () => {
    expect(source).toMatch(/Do NOT run through manager dimensions yourself/);
  });

  it("[CLIENT_NAME] is substituted with the real company name before any model call", () => {
    // Without this the model is told it works for a literal
    // "[CLIENT_NAME]" and invents a company when it needs one —
    // staging watched it confidently call the client "Oakmont".
    expect(source).toMatch(
      /systemPrompt = systemPrompt\.replaceAll\("\[CLIENT_NAME\]", clientName\)/
    );
  });
});
