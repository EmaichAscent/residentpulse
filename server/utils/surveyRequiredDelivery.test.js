import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

vi.mock("./aiRouter.js", () => ({
  createMessage: vi.fn(),
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

  it("stray [ASK] tags are stripped so they can never leak to a resident", () => {
    // The weave-in mechanism is retired (widget turns own delivery),
    // but the strip stays as defense against a model that remembers.
    expect(source).toMatch(/\[ASK:/);
    expect(source).toMatch(/Stripped stray \[ASK\] tag/);
    expect(source).not.toMatch(/buildWeaveInAddendum/);
    expect(source).not.toMatch(/weaveInQuestion/);
  });
});

describe("widget turns — ONE question per turn, survey or otherwise", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("a scale gets its OWN turn every ~2 conversational beats", () => {
    expect(source).toMatch(/msgsSinceLastWidget >= 2/);
    expect(source).toMatch(/aiMessageCount >= 1/); // opener stays pure text
  });

  it("required questions fill widget turns first, contextual takes over when they're done", () => {
    expect(source).toMatch(
      /if \(unansweredRequired\.length > 0\) \{\s*widgetTurnQuestion = unansweredRequired\[0\];\s*\} else \{/
    );
  });

  it("widget turns bypass the interview model — a scoped bridge call writes the reply", () => {
    // A trailing prompt directive proved unreliable on staging (the
    // model kept drilling while the scale asked something else). The
    // bridge is a single-purpose call whose no-question rule is
    // enforced in code, not prompt.
    expect(source).toMatch(/assistantMessage = await generateWidgetBridge\(\{/);
    expect(source).not.toMatch(/THIS TURN ONLY/);
  });

  it("bridge replies are typed 'bridge' — outside the close-flow turn budget", () => {
    expect(source).toMatch(/'assistant', \?, 'bridge'/);
  });

  it("exactly ONE emission site in the interview turn: gated + bare", () => {
    const matches = source.match(/emitWidgetMessage\(session, widgetTurnQuestion/g) || [];
    expect(matches).toHaveLength(1);
    expect(source).toMatch(
      /emitWidgetMessage\(session, widgetTurnQuestion, \{\s*gate: true,\s*bare: true/
    );
    // No ungated ride-alongs anywhere — that path left taps in dead air.
    expect(source).not.toMatch(/gate: false/);
  });

  it("after a mid-interview tap, the AI reacts (message_type 'reaction', outside the turn budget)", () => {
    expect(source).toMatch(/generateRatingReaction\(\{/);
    expect(source).toMatch(/'assistant', \?, 'reaction'/);
    expect(source).toMatch(
      /session\.close_phase === CLOSE_PHASE\.INTERVIEW &&\s+session\.pending_question_id === Number\(question_id\)/
    );
  });
});

describe("generateWidgetBridge — the no-question rule is enforced in code, not prompt", () => {
  const QUESTION = { code: "S02", label: "Value for services", chat_phrasing: null };

  it("passes the model's bridge through when it contains no question", async () => {
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({
      content: [
        {
          text: "A manager still ramping up makes the fee question sharper, not softer. So let's pin down the value you feel you're getting for those fees.",
        },
      ],
    });
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: QUESTION,
      history: [],
    });
    expect(text).toMatch(/value/i);
    // The scale's topic reaches the scoped call — the bubble must
    // lead directly into what the scale actually asks.
    expect(createMessage.mock.lastCall[0].system).toContain("Value for services");
  });

  it("question sentences are stripped AND the lost steer is rebuilt from the lead-in", async () => {
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({
      content: [
        { text: "Half a meeting lost to cleanup is real money. How long has that been going on?" },
      ],
    });
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: QUESTION,
      history: [],
    });
    // The stripped remainder never mentions the topic, so the
    // deterministic lead-in is appended — the bubble always connects
    // to the scale below it.
    expect(text).toBe(
      "Half a meeting lost to cleanup is real money. Quick rating while we're at it:"
    );
  });

  it("output that is ALL questions → topic-aware fallback, never a competing question", async () => {
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({
      content: [{ text: "How long are you typically waiting now?" }],
    });
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: QUESTION,
      history: [],
    });
    expect(text).not.toContain("?");
    expect(text).toContain("Quick rating while we're at it:");
  });

  it("an acknowledgment-only bridge gets the entity-aware steer appended (staging round 5)", async () => {
    // "That confusion around maintenance coordination clearly left a
    // mark" floated above a Value-for-services scale with zero
    // connective tissue. The steer is guaranteed now.
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({
      content: [
        {
          text: "That confusion around maintenance coordination clearly left a mark — when roles aren't clear, things stall.",
        },
      ],
    });
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: { code: "M01", label: "Manager overall performance", entity_target: "manager" },
      history: [],
    });
    expect(text).toMatch(/While we're on it, a quick read on your manager:$/);
  });

  it("a bridge that already steers into the topic is passed through untouched", async () => {
    const { createMessage } = await import("./aiRouter.js");
    const bridge =
      "Cleanup eating half a board meeting is a real cost. So let's pin down the value you feel you're getting for those fees.";
    createMessage.mockResolvedValueOnce({ content: [{ text: bridge }] });
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: QUESTION,
      history: [],
    });
    expect(text).toBe(bridge); // "value" stems-match the label — no append
  });

  it("already-rated topics are fenced off — the steer can't drift backwards", async () => {
    // Staging: the bridge for Manager overall performance steered
    // toward value-for-services (already rated) because a worked
    // example in the prompt mentioned fees. The example is gone and
    // covered labels are passed as explicit exclusions.
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({ content: [{ text: "Noted." }] });
    await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: { code: "M01", label: "Manager overall performance", chat_phrasing: null },
      history: [],
      coveredLabels: ["Value for services", "Overall communication"],
    });
    const system = createMessage.mock.lastCall[0].system;
    expect(system).toContain("do not steer toward any of them: Value for services");
    expect(system).toContain('pivot INTO "Manager overall performance"');
    expect(system).not.toContain("the value you're getting for those fees");
  });

  it("API failure → fallback, never a stalled chat", async () => {
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockRejectedValueOnce(new Error("boom"));
    const text = await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: QUESTION,
      history: [],
    });
    expect(text).not.toContain("?");
    expect(text.length).toBeGreaterThan(10);
  });

  it("authored chat_phrasing outranks the label as the scale's topic", async () => {
    const { createMessage } = await import("./aiRouter.js");
    createMessage.mockResolvedValueOnce({ content: [{ text: "Noted. On to value." }] });
    await runtime.generateWidgetBridge({
      clientName: "Zee Best Management",
      question: { ...QUESTION, chat_phrasing: "How well do we deliver value for your fees?" },
      history: [],
    });
    expect(createMessage.mock.lastCall[0].system).toContain(
      "How well do we deliver value for your fees?"
    );
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
