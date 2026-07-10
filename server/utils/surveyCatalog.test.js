import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: { get: vi.fn(), run: vi.fn(), all: vi.fn() },
}));

let db;
let catalog;

beforeEach(async () => {
  vi.resetModules();
  db = (await import("../db.js")).default;
  catalog = await import("./surveyCatalog.js");
  vi.clearAllMocks();
});

describe("nextQuestionCode", () => {
  it("starts each entity series at 01", async () => {
    db.all.mockResolvedValueOnce([]);
    expect(await catalog.nextQuestionCode("manager")).toBe("M01");
  });

  it("continues from the highest existing number in the prefix series", async () => {
    db.all.mockResolvedValueOnce([{ code: "M01" }, { code: "M07" }, { code: "M14" }]);
    expect(await catalog.nextQuestionCode("manager")).toBe("M15");
  });

  it("ignores codes from other prefixes and non-numeric suffixes", async () => {
    // LIKE 'C%' can match C-prefixed codes with odd shapes; only clean
    // ^C\d+$ codes count toward the series.
    db.all.mockResolvedValueOnce([{ code: "C03" }, { code: "CX9" }, { code: "C1B" }]);
    expect(await catalog.nextQuestionCode("company")).toBe("C04");
  });

  it("maps all four entity targets to their documented prefixes", () => {
    expect(catalog.ENTITY_PREFIX).toEqual({
      company: "C",
      manager: "M",
      bookkeeper: "F",
      community: "Y",
    });
  });

  it("throws on an unknown entity target", async () => {
    await expect(catalog.nextQuestionCode("vendor")).rejects.toThrow(/Unknown entity_target/);
  });
});

describe("buildTemplateConfig", () => {
  it("denormalizes questions with their triggers, ordered", async () => {
    db.all
      .mockResolvedValueOnce([
        {
          template_question_id: 11,
          tier: "required",
          sort_order: 0,
          nps_band_max: null,
          question_id: 1,
          code: "Q001",
          label: "NPS",
          category: "NPS",
          entity_target: "company",
          answer_format: "nps",
          format_config: null,
          chat_phrasing: null,
        },
        {
          template_question_id: 12,
          tier: "contextual",
          sort_order: 1,
          nps_band_max: 6,
          question_id: 2,
          code: "M04",
          label: "Responsive",
          category: "Manager",
          entity_target: "manager",
          answer_format: "likert5",
          format_config: '{"low":"Very poor","high":"Excellent"}',
          chat_phrasing: null,
        },
      ])
      .mockResolvedValueOnce([]) // triggers for Q001
      .mockResolvedValueOnce([{ id: 3, label: "responsiveness", description: "slow responses" }]);

    const config = await catalog.buildTemplateConfig(5);
    expect(config.questions).toHaveLength(2);
    expect(config.questions[0].code).toBe("Q001");
    expect(config.questions[0].triggers).toEqual([]);
    expect(config.questions[1].triggers).toHaveLength(1);
    // format_config stored as a JSON string comes back parsed
    expect(config.questions[1].format_config).toEqual({ low: "Very poor", high: "Excellent" });
    // Only active rows are published
    expect(db.all.mock.calls[0][0]).toMatch(/tq\.status = 'active'/);
    expect(db.all.mock.calls[0][0]).toMatch(/q\.status = 'active'/);
  });
});

describe("validateConfigForPublish", () => {
  it("rejects an empty template", () => {
    const problems = catalog.validateConfigForPublish({ questions: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no active questions/);
  });

  it("rejects a contextual question with no triggers (it could never fire)", () => {
    const problems = catalog.validateConfigForPublish({
      questions: [
        { code: "Q001", label: "NPS", tier: "required", triggers: [] },
        { code: "M04", label: "Responsive", tier: "contextual", triggers: [] },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/M04.*never fire/);
  });

  it("accepts a well-formed config", () => {
    const problems = catalog.validateConfigForPublish({
      questions: [
        { code: "Q001", label: "NPS", tier: "required", triggers: [] },
        { code: "M04", label: "Responsive", tier: "contextual", triggers: [{ id: 1 }] },
      ],
    });
    expect(problems).toHaveLength(0);
  });
});

describe("surveyBuilder routes — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "surveyBuilder.js"), "utf8");
  });

  it("is superadmin-gated", () => {
    expect(source).toMatch(/router\.use\(requireSuperAdmin\)/);
  });

  it("registers the full CRUD + publish surface", () => {
    expect(source).toMatch(/router\.get\(\s*"\/questions"/);
    expect(source).toMatch(/router\.post\(\s*"\/questions"/);
    expect(source).toMatch(/router\.put\(\s*"\/questions\/:id"/);
    expect(source).toMatch(/router\.get\(\s*"\/triggers"/);
    expect(source).toMatch(/router\.post\(\s*"\/triggers"/);
    expect(source).toMatch(/router\.get\(\s*"\/templates"/);
    expect(source).toMatch(/router\.post\(\s*"\/templates\/:id\/questions"/);
    expect(source).toMatch(/router\.post\(\s*"\/templates\/:id\/publish"/);
  });

  it("enforces the format lock (409 when answers exist)", () => {
    expect(source).toMatch(/questionHasAnswers/);
    expect(source).toMatch(/Answer format is locked/);
  });

  it("enforces the continuity guard on hard removal (retire suggestion)", () => {
    expect(source).toMatch(/suggestion: "retire"/);
  });

  it("re-adding a retired question re-activates instead of duplicating", () => {
    expect(source).toMatch(/status = 'active', retired_at = NULL/);
  });

  it("allows exactly one global default template", () => {
    expect(source).toMatch(/A default template already exists/);
    expect(source).toMatch(/must be global/);
  });

  it("is mounted before the general superadmin router", async () => {
    const indexJs = await readFile(join(__dirname, "..", "index.js"), "utf8");
    const surveysIdx = indexJs.indexOf('app.use("/api/superadmin/surveys"');
    const superadminIdx = indexJs.indexOf('app.use("/api/superadmin", superadminRoutes)');
    expect(surveysIdx).toBeGreaterThan(-1);
    expect(superadminIdx).toBeGreaterThan(-1);
    expect(surveysIdx).toBeLessThan(superadminIdx);
  });
});
