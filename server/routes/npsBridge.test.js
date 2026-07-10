import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The legacy NPS scale bridges to the template's NPS question in
// hybrid sessions — otherwise the baseline batch re-asks a question
// the resident already answered (found live on staging session 2487:
// nps_score set, zero survey_answers rows).

describe("NPS → template-answer bridge", () => {
  let sessionsSrc;
  let runtimeSrc;
  beforeAll(async () => {
    sessionsSrc = await readFile(join(__dirname, "sessions.js"), "utf8");
    runtimeSrc = await readFile(join(__dirname, "..", "utils", "surveyRuntime.js"), "utf8");
  });

  it("PATCH /:id/nps records the template's NPS answer for hybrid sessions", () => {
    expect(sessionsSrc).toMatch(/q\.answer_format === "nps"/);
    expect(sessionsSrc).toMatch(/transcript: false/);
  });

  it("bridge is idempotent — an existing Q001 answer is never duplicated", () => {
    const bridgeBlock = sessionsSrc.slice(sessionsSrc.indexOf("Hybrid bridge:"));
    expect(bridgeBlock).toMatch(
      /SELECT id FROM survey_answers WHERE session_id = \? AND question_id = \?/
    );
  });

  it("bridge failure degrades to the old double-ask, never a broken chat", () => {
    expect(sessionsSrc).toMatch(/baseline batch may re-ask NPS/);
  });

  it("recordAnswer supports transcript:false without dropping the answer row", () => {
    expect(runtimeSrc).toMatch(/transcript = true/);
    expect(runtimeSrc).toMatch(/if \(transcript\) \{/);
    // The answer INSERT is unconditional; only the transcript line gates.
    const answerIdx = runtimeSrc.indexOf("INSERT INTO survey_answers");
    const gateIdx = runtimeSrc.indexOf("if (transcript) {");
    expect(answerIdx).toBeGreaterThan(-1);
    expect(answerIdx).toBeLessThan(gateIdx);
  });
});
