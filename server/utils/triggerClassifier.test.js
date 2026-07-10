import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("./anthropicClient.js", () => ({
  createMessage: vi.fn(),
}));

let anthropic;
let classifier;

const TRIGGERS = [
  { id: 10, label: "responsiveness", description: "slow responses, unreturned calls" },
  { id: 20, label: "vendor issues", description: "vendor or landscaping problems" },
  { id: 30, label: "finance", description: "financial reports, budgets, dues" },
];

beforeEach(async () => {
  vi.resetModules();
  anthropic = await import("./anthropicClient.js");
  classifier = await import("./triggerClassifier.js");
  vi.clearAllMocks();
});

describe("classifyMessage", () => {
  it("maps the classifier's numbers back to trigger ids", async () => {
    anthropic.createMessage.mockResolvedValueOnce({ content: [{ type: "text", text: "[1,3]" }] });
    const ids = await classifier.classifyMessage(
      "emails go unanswered and dues are wrong",
      TRIGGERS
    );
    expect(ids).toEqual([10, 30]);
  });

  it("returns [] without calling the model for empty inputs", async () => {
    expect(await classifier.classifyMessage("", TRIGGERS)).toEqual([]);
    expect(await classifier.classifyMessage("hello", [])).toEqual([]);
    expect(anthropic.createMessage).not.toHaveBeenCalled();
  });

  it("tolerates a chatty reply by extracting the JSON array", async () => {
    anthropic.createMessage.mockResolvedValueOnce({
      content: [{ type: "text", text: "The matches are: [2]" }],
    });
    const ids = await classifier.classifyMessage("the landscaper skipped us again", TRIGGERS);
    expect(ids).toEqual([20]);
  });

  it("discards out-of-range and non-integer numbers instead of crashing", async () => {
    anthropic.createMessage.mockResolvedValueOnce({
      content: [{ type: "text", text: "[0, 2, 9, 1.5]" }],
    });
    const ids = await classifier.classifyMessage("something", TRIGGERS);
    expect(ids).toEqual([20]);
  });

  it("returns [] on an unparseable reply", async () => {
    anthropic.createMessage.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot determine that." }],
    });
    expect(await classifier.classifyMessage("something", TRIGGERS)).toEqual([]);
  });

  it("uses Haiku directly — never the provider router", async () => {
    anthropic.createMessage.mockResolvedValueOnce({ content: [{ type: "text", text: "[]" }] });
    await classifier.classifyMessage("something", TRIGGERS);
    expect(anthropic.createMessage.mock.calls[0][0].model).toMatch(/haiku/);
    const source = await readFile(join(__dirname, "triggerClassifier.js"), "utf8");
    expect(source).not.toMatch(/aiRouter/);
  });
});

describe("checkOverlaps", () => {
  it("maps overlap numbers back to trigger ids", async () => {
    anthropic.createMessage.mockResolvedValueOnce({ content: [{ type: "text", text: "[2]" }] });
    const ids = await classifier.checkOverlaps("landscaping complaints", TRIGGERS);
    expect(ids).toEqual([20]);
  });

  it("returns [] for empty description or empty library", async () => {
    expect(await classifier.checkOverlaps("", TRIGGERS)).toEqual([]);
    expect(await classifier.checkOverlaps("gate problems", [])).toEqual([]);
    expect(anthropic.createMessage).not.toHaveBeenCalled();
  });
});

describe("surveyBuilder trigger endpoints — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "..", "routes", "surveyBuilder.js"), "utf8");
  });

  it("registers /triggers/test and /triggers/overlap", () => {
    expect(source).toMatch(/router\.post\(\s*"\/triggers\/test"/);
    expect(source).toMatch(/router\.post\(\s*"\/triggers\/overlap"/);
  });

  it("test endpoint reports co-firing existing triggers (design-time conflict callout)", () => {
    expect(source).toMatch(/co_firing/);
  });
});
