import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

let db;
let runtime;

beforeEach(async () => {
  vi.resetModules();
  db = (await import("../db.js")).default;
  runtime = await import("./surveyRuntime.js");
  vi.clearAllMocks();
  db.run.mockResolvedValue({});
  db.all.mockResolvedValue([]);
});

const LIKERT_Q = {
  question_id: 7,
  code: "M04",
  label: "Responsive",
  entity_target: "manager",
  answer_format: "likert5",
  format_config: { low: "Very poor", high: "Excellent" },
};

const SESSION = {
  id: 100,
  client_id: 3,
  community_id: 55,
  round_id: 9,
  template_version_id: 12,
  is_test: false,
  pending_question_id: 7,
};

describe("resolveTemplateVersionId", () => {
  it("prefers the client's own template over the default", async () => {
    db.get.mockResolvedValueOnce({ id: 41 }); // client template version
    expect(await runtime.resolveTemplateVersionId(3)).toBe(41);
    expect(db.get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the global default's latest version", async () => {
    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 9 });
    expect(await runtime.resolveTemplateVersionId(3)).toBe(9);
    expect(db.get.mock.calls[1][0]).toMatch(/is_default = TRUE/);
  });

  it("returns null when nothing is published (legacy pure-chat flow)", async () => {
    db.get.mockResolvedValue(null);
    expect(await runtime.resolveTemplateVersionId(3)).toBe(null);
  });
});

describe("resolveEntityId", () => {
  it("company answers attach to no roster row", async () => {
    expect(await runtime.resolveEntityId("company", SESSION)).toBe(null);
    expect(db.get).not.toHaveBeenCalled();
  });

  it("community answers attach to the session's community", async () => {
    expect(await runtime.resolveEntityId("community", SESSION)).toBe(55);
  });

  it("manager/bookkeeper answers resolve through the community's FKs", async () => {
    db.get.mockResolvedValue({ manager_id: 21, bookkeeper_id: 33 });
    expect(await runtime.resolveEntityId("manager", SESSION)).toBe(21);
    expect(await runtime.resolveEntityId("bookkeeper", SESSION)).toBe(33);
  });

  it("degrades to null when the session has no community", async () => {
    expect(await runtime.resolveEntityId("manager", { ...SESSION, community_id: null })).toBe(null);
  });
});

describe("formatAnswerLine", () => {
  it("renders each format compactly for the transcript", () => {
    expect(runtime.formatAnswerLine(LIKERT_Q, 2, false)).toBe("[Responsive: 2/5]");
    expect(runtime.formatAnswerLine(LIKERT_Q, 5, false)).toBe("[Responsive: 5/5 — Excellent]");
    expect(runtime.formatAnswerLine({ label: "NPS", answer_format: "nps" }, 6, false)).toBe(
      "[NPS: 6/10]"
    );
    expect(
      runtime.formatAnswerLine({ label: "Meets goals", answer_format: "yes_no" }, true, false)
    ).toBe("[Meets goals: Yes]");
    expect(
      runtime.formatAnswerLine(
        { label: "Behaviors", answer_format: "multi_select" },
        ["Defensive", "Slow email"],
        false
      )
    ).toBe("[Behaviors: Defensive, Slow email]");
  });

  it("renders skips explicitly — a skip is data, not a hole", () => {
    expect(runtime.formatAnswerLine(LIKERT_Q, null, true)).toBe("[Responsive: skipped]");
  });
});

describe("recordAnswer", () => {
  it("writes the answer row, the transcript row, and clears the gate", async () => {
    db.get.mockResolvedValue({ manager_id: 21, bookkeeper_id: null });
    const { display } = await runtime.recordAnswer({
      session: SESSION,
      question: LIKERT_Q,
      value: 2,
      skipped: false,
    });

    expect(display).toBe("[Responsive: 2/5]");

    const insertAnswer = db.run.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO survey_answers")
    );
    expect(insertAnswer).toBeTruthy();
    // (session, question, template_version, round, client, entity_type, entity_id, status, numeric, ...)
    expect(insertAnswer[1].slice(0, 9)).toEqual([100, 7, 12, 9, 3, "manager", 21, "answered", 2]);

    const insertMsg = db.run.mock.calls.find(([sql]) => sql.includes("'widget_answer'"));
    expect(insertMsg).toBeTruthy();

    const clearGate = db.run.mock.calls.find(([sql]) =>
      sql.includes("SET pending_question_id = NULL")
    );
    expect(clearGate).toBeTruthy();
  });

  it("an NPS widget answer also updates sessions.nps_score (legacy plumbing intact)", async () => {
    const npsQ = {
      question_id: 1,
      code: "Q001",
      label: "NPS",
      entity_target: "company",
      answer_format: "nps",
    };
    await runtime.recordAnswer({
      session: { ...SESSION, pending_question_id: 1 },
      question: npsQ,
      value: 6,
      skipped: false,
    });
    const npsUpdate = db.run.mock.calls.find(([sql]) => sql.includes("SET nps_score"));
    expect(npsUpdate).toBeTruthy();
    expect(npsUpdate[1]).toEqual([6, 100]);
  });

  it("skips write a 'skipped' row with no values", async () => {
    db.get.mockResolvedValue({ manager_id: 21 });
    await runtime.recordAnswer({
      session: SESSION,
      question: LIKERT_Q,
      value: null,
      skipped: true,
    });
    const insertAnswer = db.run.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO survey_answers")
    );
    expect(insertAnswer[1][7]).toBe("skipped");
    expect(insertAnswer[1][8]).toBe(null); // value_numeric
  });
});

describe("emitWidgetMessage", () => {
  it("inserts a widget message and sets the gate when required", async () => {
    await runtime.emitWidgetMessage(SESSION, LIKERT_Q, { gate: true });
    const insertMsg = db.run.mock.calls.find(([sql]) => sql.includes("'widget'"));
    expect(insertMsg).toBeTruthy();
    const payload = JSON.parse(insertMsg[1][2]);
    expect(payload).toMatchObject({
      question_id: 7,
      code: "M04",
      answer_format: "likert5",
      gate: true,
    });
    const setGate = db.run.mock.calls.find(([sql]) => sql.includes("SET pending_question_id = ?"));
    expect(setGate[1]).toEqual([7, 100]);
  });

  it("contextual widgets don't gate", async () => {
    await runtime.emitWidgetMessage(SESSION, LIKERT_Q, { gate: false });
    const setGate = db.run.mock.calls.find(([sql]) => sql.includes("SET pending_question_id = ?"));
    expect(setGate).toBeFalsy();
  });
});

describe("chat.js widget wiring — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "chat.js"), "utf8");
  });

  it("gates free text while a required widget is pending (409 answer_required)", () => {
    expect(source).toMatch(/session\.pending_question_id/);
    expect(source).toMatch(/answer_required/);
  });

  it("registers POST /answer resolving questions from the FROZEN template config", () => {
    expect(source).toMatch(/router\.post\(\s*"\/answer"/);
    expect(source).toMatch(/getTemplateConfig\(session\.template_version_id\)/);
  });

  it("rejects double answers (unique per session+question)", () => {
    expect(source).toMatch(/already answered/);
  });
});

describe("session creation — template binding", () => {
  it("stamps template_version_id at session creation", async () => {
    const source = await readFile(join(__dirname, "..", "routes", "sessions.js"), "utf8");
    expect(source).toMatch(/resolveTemplateVersionId\(user\.client_id\)/);
    expect(source).toMatch(/template_version_id/);
    // Message history includes widget fields for the chat UI
    expect(source).toMatch(/message_type, widget_payload/);
  });
});
