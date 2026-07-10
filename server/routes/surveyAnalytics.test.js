import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

const { composeQuestionTrends } = await import("./surveyAnalytics.js");

const QUESTIONS = [
  {
    id: 1,
    code: "C03",
    label: "Overall communication",
    category: "Company service",
    entity_target: "company",
    answer_format: "likert5",
  },
  {
    id: 2,
    code: "Q001",
    label: "NPS",
    category: "NPS",
    entity_target: "company",
    answer_format: "nps",
  },
  {
    id: 3,
    code: "F01",
    label: "Financial report accuracy",
    category: "Financials",
    entity_target: "bookkeeper",
    answer_format: "likert5",
  },
];

describe("composeQuestionTrends", () => {
  it("merges averages, statuses, and Zoho delta labels per round, ordered", () => {
    const numeric = [
      { question_id: 1, round_id: 11, round_number: 2, avg: "3.6667" },
      { question_id: 1, round_id: 10, round_number: 1, avg: "4.2" },
    ];
    const statuses = [
      { question_id: 1, round_id: 10, round_number: 1, status: "answered", count: "5" },
      { question_id: 1, round_id: 11, round_number: 2, status: "answered", count: "3" },
      { question_id: 1, round_id: 11, round_number: 2, status: "skipped", count: "1" },
    ];
    const deltas = [
      {
        question_id: 1,
        round_id: 10,
        round_number: 1,
        zoho_label: "Somewhat Improved",
        count: "2",
      },
    ];

    const out = composeQuestionTrends(QUESTIONS, numeric, statuses, deltas);
    const c03 = out.find((q) => q.code === "C03");
    expect(c03.rounds.map((r) => r.round_number)).toEqual([1, 2]); // sorted
    expect(c03.rounds[0]).toMatchObject({
      avg: 4.2,
      answered: 5,
      delta_counts: { "Somewhat Improved": 2 },
    });
    expect(c03.rounds[1]).toMatchObject({ avg: 3.67, answered: 3, skipped: 1 });
  });

  it("drops questions with no answer rows at all (empty dashboards stay clean)", () => {
    const out = composeQuestionTrends(
      QUESTIONS,
      [{ question_id: 1, round_id: 10, round_number: 1, avg: "4" }],
      [],
      []
    );
    expect(out.map((q) => q.code)).toEqual(["C03"]);
  });

  it("delta-era rounds without numeric answers keep avg null (rendered as delta-mode)", () => {
    const out = composeQuestionTrends(
      QUESTIONS,
      [],
      [{ question_id: 3, round_id: 10, round_number: 1, status: "answered", count: "4" }],
      [{ question_id: 3, round_id: 10, round_number: 1, zoho_label: "Declined", count: "4" }]
    );
    const f01 = out.find((q) => q.code === "F01");
    expect(f01.rounds[0].avg).toBe(null);
    expect(f01.rounds[0].delta_counts).toEqual({ Declined: 4 });
  });
});

describe("surveyAnalytics routes — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "surveyAnalytics.js"), "utf8");
  });

  it("is client-admin gated and GET-only (viewer-safe by construction)", () => {
    expect(source).toMatch(/router\.use\(requireClientAdmin\)/);
    expect(source).toMatch(/router\.get\(\s*"\/questions"/);
    expect(source).toMatch(/router\.get\(\s*"\/people"/);
    expect(source).not.toMatch(/router\.(post|put|delete|patch)\(/);
  });

  it("every aggregate is scoped by client AND test mode", () => {
    const clientScopes = (source.match(/a\.client_id = \?/g) || []).length;
    expect(clientScopes).toBeGreaterThanOrEqual(4);
    expect(source).toMatch(/a\.is_test = \?/);
  });

  it("people rollups attach through entity_type/entity_id (Phase B roster FKs)", () => {
    expect(source).toMatch(/a\.entity_type = \? AND a\.entity_id = p\.id/);
  });

  it("is mounted in index.js under /api/admin", async () => {
    const indexJs = await readFile(join(__dirname, "..", "index.js"), "utf8");
    expect(indexJs).toMatch(/app\.use\("\/api\/admin\/survey-analytics", surveyAnalyticsRoutes\)/);
  });
});
