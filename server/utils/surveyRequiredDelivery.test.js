import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

let runtime;
let closeFlow;

beforeEach(async () => {
  vi.resetModules();
  runtime = await import("./surveyRuntime.js");
  closeFlow = await import("./closeFlow.js");
});

const CONFIG = {
  questions: [
    { question_id: 1, code: "Q001", label: "NPS", tier: "required", sort_order: 0 },
    { question_id: 2, code: "C03", label: "Communication", tier: "required", sort_order: 1 },
    { question_id: 3, code: "M04", label: "Responsive", tier: "contextual", sort_order: 2 },
    { question_id: 4, code: "M01", label: "Manager overall", tier: "required", sort_order: 3 },
  ],
};

describe("getUnansweredRequired", () => {
  it("returns required questions not yet answered, in template order", () => {
    const remaining = runtime.getUnansweredRequired(CONFIG, new Set([1]));
    expect(remaining.map((q) => q.code)).toEqual(["C03", "M01"]);
  });

  it("never includes contextual questions (they're AI-discretion, not guaranteed)", () => {
    const remaining = runtime.getUnansweredRequired(CONFIG, new Set());
    expect(remaining.every((q) => q.tier === "required")).toBe(true);
  });

  it("returns [] when everything required is answered or config is missing", () => {
    expect(runtime.getUnansweredRequired(CONFIG, new Set([1, 2, 4]))).toEqual([]);
    expect(runtime.getUnansweredRequired(null, new Set())).toEqual([]);
  });
});

describe("baselineIntro", () => {
  it("singular and plural forms explain WHY the questions are arriving", () => {
    const q = { label: "Manager overall", chat_phrasing: null };
    expect(runtime.baselineIntro(1, q)).toMatch(/one quick baseline rate/);
    expect(runtime.baselineIntro(3, q)).toMatch(/3 quick baseline rates/);
    expect(runtime.baselineIntro(3, q)).toMatch(/comparable with the rest of your board/);
  });

  it("uses the question's chat phrasing when set", () => {
    const q = { label: "X", chat_phrasing: "How is your manager overall?" };
    expect(runtime.baselineIntro(2, q)).toMatch(/How is your manager overall\?$/);
  });
});

describe("buildWeaveInAddendum", () => {
  it("lists each unanswered required question with its [ASK:code] tag", () => {
    const addendum = runtime.buildWeaveInAddendum(
      CONFIG.questions.filter((q) => q.tier === "required")
    );
    expect(addendum).toMatch(/\[ASK:Q001\]/);
    expect(addendum).toMatch(/\[ASK:C03\]/);
    expect(addendum).toMatch(/\[ASK:M01\]/);
    expect(addendum).toMatch(/At most ONE tag per reply/);
    expect(addendum).toMatch(/Never mention the tags/);
  });

  it("is empty when nothing remains — no prompt noise", () => {
    expect(runtime.buildWeaveInAddendum([])).toBe("");
  });
});

describe("close-flow phase machine gains baseline_batch", () => {
  it("BASELINE_BATCH sits between interview and playback", () => {
    expect(closeFlow.CLOSE_PHASE.BASELINE_BATCH).toBe("baseline_batch");
  });
});

describe("chat.js D2 wiring — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("enters baseline_batch when required questions remain at close time", () => {
    expect(source).toMatch(/CLOSE_PHASE\.BASELINE_BATCH/);
    expect(source).toMatch(/getUnansweredRequired\(config, answered\)/);
    expect(source).toMatch(/baselineIntro\(remaining\.length, first\)/);
  });

  it("answer continuation emits the next widget or fires the playback", () => {
    expect(source).toMatch(/baseline batch complete/);
    expect(source).toMatch(/next\.push/);
  });

  it("system prompt gains the weave-in addendum only for template sessions", () => {
    expect(source).toMatch(/buildWeaveInAddendum\(unansweredRequired\)/);
  });

  it("[ASK:code] is intercepted, stripped, and validated against unanswered required", () => {
    expect(source).toMatch(/\[ASK:/);
    expect(source).toMatch(/unansweredRequired\.find\(\(q\) => q\.code === code\)/);
    expect(source).toMatch(/Stripped \[ASK\] tag/);
  });

  it("weave-in widgets are gated (required delivery is never optional)", () => {
    expect(source).toMatch(/emitWidgetMessage\(session, weaveInQuestion, \{\s*gate: true/);
  });
});

describe("required cadence (post-mockup-review fix) — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("from the second AI turn, replies carry the next unanswered required widget", () => {
    expect(source).toMatch(/aiMessageCount >= 1 && unansweredRequired\.length > 0/);
    expect(source).toMatch(/emitWidgetMessage\(session, unansweredRequired\[0\], \{\s*gate: true/);
  });

  it("cadence is LAST in widget priority — weave-in and contextual outrank it", () => {
    const weaveIdx = source.indexOf("emitWidgetMessage(session, weaveInQuestion");
    const contextualIdx = source.indexOf("emitWidgetMessage(session, contextualQuestion");
    const cadenceIdx = source.indexOf("emitWidgetMessage(session, unansweredRequired[0]");
    expect(weaveIdx).toBeGreaterThan(-1);
    expect(weaveIdx).toBeLessThan(contextualIdx);
    expect(contextualIdx).toBeLessThan(cadenceIdx);
  });

  it("the opener stays pure text (cadence starts at the second turn)", () => {
    // aiMessageCount >= 1 means the first AI reply (count 0) never
    // carries a cadence widget.
    expect(source).toMatch(/aiMessageCount >= 1/);
  });
});

describe("buildWidgetPhrasing — grammatically safe lead-ins for unauthored questions", () => {
  it("varies the likert connector by entity, never embedding the label", () => {
    const phrase = (entity) =>
      runtime.buildWidgetPhrasing({
        answer_format: "likert5",
        entity_target: entity,
        label: "Responsive",
      });
    expect(phrase("manager")).toMatch(/your manager/);
    expect(phrase("bookkeeper")).toMatch(/financial side/);
    expect(phrase("community")).toMatch(/your community/);
    expect(phrase("company")).toMatch(/Quick rating/);
    // The label NEVER appears in the lead-in — it renders as the
    // widget's caption client-side. "Responsive" as bubble text was
    // the staging complaint this fixes.
    for (const e of ["manager", "bookkeeper", "community", "company"]) {
      expect(phrase(e)).not.toMatch(/Responsive/);
    }
  });

  it("format-specific lead-ins for the non-likert widgets", () => {
    expect(runtime.buildWidgetPhrasing({ answer_format: "nps" })).toMatch(/0–10/);
    expect(runtime.buildWidgetPhrasing({ answer_format: "multi_select" })).toMatch(/Tap any/);
    expect(runtime.buildWidgetPhrasing({ answer_format: "open_text" })).toMatch(/your own words/);
  });

  it("authored chat_phrasing always outranks the generated lead-in", async () => {
    // emitWidgetMessage precedence: override > chat_phrasing > generated
    const src = await readFile(join(__dirname, "surveyRuntime.js"), "utf8");
    expect(src).toMatch(
      /phrasingOverride\?\.trim\(\) \|\| question\.chat_phrasing\?\.trim\(\) \|\| buildWidgetPhrasing\(question\)/
    );
  });
});
