import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

vi.mock("./triggerClassifier.js", () => ({
  classifyMessage: vi.fn(),
  checkOverlaps: vi.fn(),
}));

let db;
let classifier;
let runtime;

beforeEach(async () => {
  vi.resetModules();
  db = (await import("../db.js")).default;
  classifier = await import("./triggerClassifier.js");
  runtime = await import("./surveyRuntime.js");
  vi.clearAllMocks();
});

const T_RESP = { id: 10, label: "responsiveness", description: "slow responses" };
const T_FIN = { id: 20, label: "finance", description: "financial issues" };

const CONFIG = {
  questions: [
    { question_id: 1, code: "Q001", label: "NPS", tier: "required", sort_order: 0, triggers: [] },
    {
      question_id: 2,
      code: "M04",
      label: "Responsive",
      tier: "contextual",
      sort_order: 1,
      nps_band_max: 6,
      triggers: [T_RESP],
    },
    {
      question_id: 3,
      code: "F01",
      label: "Financial accuracy",
      tier: "contextual",
      sort_order: 2,
      nps_band_max: null,
      triggers: [T_FIN],
    },
  ],
};

describe("pickContextualQuestion — pure selection rules", () => {
  const base = {
    config: CONFIG,
    matchedTriggerIds: [10, 20],
    emittedQuestionIds: new Set(),
    contextualFiredCount: 0,
    npsScore: 6,
  };

  it("picks the first eligible by template order — max one per turn", () => {
    expect(runtime.pickContextualQuestion(base).code).toBe("M04");
  });

  it("never re-fires an already-emitted question", () => {
    const q = runtime.pickContextualQuestion({ ...base, emittedQuestionIds: new Set([2]) });
    expect(q.code).toBe("F01");
  });

  it("respects the per-session cap", () => {
    expect(
      runtime.pickContextualQuestion({
        ...base,
        contextualFiredCount: runtime.MAX_CONTEXTUAL_PER_SESSION,
      })
    ).toBe(null);
  });

  it("NPS band gates firing: above band or unknown score = no fire", () => {
    // Score 8 > band 6 → M04 ineligible, F01 (no band) still fires
    expect(runtime.pickContextualQuestion({ ...base, npsScore: 8 }).code).toBe("F01");
    // Unknown score: banded questions can't pass
    expect(
      runtime.pickContextualQuestion({ ...base, matchedTriggerIds: [10], npsScore: null })
    ).toBe(null);
  });

  it("returns null when nothing matched", () => {
    expect(runtime.pickContextualQuestion({ ...base, matchedTriggerIds: [] })).toBe(null);
  });

  it("required questions are never contextual-fired", () => {
    const cfg = {
      questions: [
        { question_id: 9, code: "C03", tier: "required", sort_order: 0, triggers: [T_RESP] },
      ],
    };
    expect(runtime.pickContextualQuestion({ ...base, config: cfg, matchedTriggerIds: [10] })).toBe(
      null
    );
  });
});

describe("selectContextualForSession — full nomination pass", () => {
  const SESSION = { id: 100, nps_score: 6 };

  it("classifies against distinct triggers of not-yet-fired questions and picks", async () => {
    db.all
      .mockResolvedValueOnce([]) // no widgets emitted yet
      .mockResolvedValueOnce([]); // no answers yet
    classifier.classifyMessage.mockResolvedValueOnce([10]);

    const q = await runtime.selectContextualForSession(SESSION, CONFIG, "calls go unanswered");
    expect(q.code).toBe("M04");
    // The classifier got both distinct triggers exactly once each
    const triggerArg = classifier.classifyMessage.mock.calls[0][1];
    expect(triggerArg.map((t) => t.id).sort()).toEqual([10, 20]);
  });

  it("skips the classifier entirely when every contextual question already fired", async () => {
    db.all
      .mockResolvedValueOnce([
        { widget_payload: JSON.stringify({ question_id: 2 }) },
        { widget_payload: JSON.stringify({ question_id: 3 }) },
      ])
      .mockResolvedValueOnce([]);
    const q = await runtime.selectContextualForSession(SESSION, CONFIG, "whatever");
    expect(q).toBe(null);
    expect(classifier.classifyMessage).not.toHaveBeenCalled();
  });

  it("counts emitted contextual widgets toward the session cap", async () => {
    const emitted = [2, 3, 2, 3].map((qid) => ({
      widget_payload: JSON.stringify({ question_id: qid }),
    }));
    db.all.mockResolvedValueOnce(emitted).mockResolvedValueOnce([]);
    const q = await runtime.selectContextualForSession(SESSION, CONFIG, "whatever");
    expect(q).toBe(null);
  });

  it("returns null for templates with no contextual questions", async () => {
    const cfg = { questions: [{ question_id: 1, tier: "required", triggers: [] }] };
    expect(await runtime.selectContextualForSession(SESSION, cfg, "msg")).toBe(null);
    expect(db.all).not.toHaveBeenCalled();
  });
});

describe("chat.js D3 wiring — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("nomination runs concurrently with the interview reply", () => {
    const nominationIdx = source.indexOf("selectContextualForSession(session, templateConfig");
    const replyIdx = source.indexOf('model: "claude-sonnet-4-5-20250929"');
    expect(nominationIdx).toBeGreaterThan(-1);
    expect(nominationIdx).toBeLessThan(replyIdx);
  });

  it("nomination failure never breaks the turn", () => {
    expect(source).toMatch(/Contextual nomination failed — turn continues without it/);
  });

  it("weave-in outranks contextual — one widget per turn", () => {
    expect(source).toMatch(/if \(weaveInQuestion\)[\s\S]*?\} else \{[\s\S]*?contextualPromise/);
  });

  it("contextual widgets never gate", () => {
    expect(source).toMatch(/emitWidgetMessage\(session, contextualQuestion, \{\s*gate: false/);
  });
});
