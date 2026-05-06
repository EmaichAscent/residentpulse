import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock `db` and the two underlying clients BEFORE importing
// aiRouter, since the router resolves the providers at import time
// via top-level imports.

vi.mock("../db.js", () => ({
  default: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}));

vi.mock("./anthropicClient.js", () => ({
  createMessage: vi.fn(),
}));

vi.mock("./xaiClient.js", () => ({
  createXaiMessage: vi.fn(),
  defaultXaiModelFor: () => "grok-4.20-non-reasoning",
}));

let aiRouter;
let db;
let anthropicClient;
let xaiClient;

beforeEach(async () => {
  // Re-import with fresh module state so the in-memory provider cache
  // doesn't leak across tests.
  vi.resetModules();
  db = (await import("../db.js")).default;
  anthropicClient = await import("./anthropicClient.js");
  xaiClient = await import("./xaiClient.js");
  aiRouter = await import("./aiRouter.js");

  // Default: no row → router uses "anthropic"
  db.get.mockResolvedValue(null);
  anthropicClient.createMessage.mockResolvedValue({
    content: [{ type: "text", text: "from-anthropic" }],
    stop_reason: "end_turn",
  });
  xaiClient.createXaiMessage.mockResolvedValue({
    content: [{ type: "text", text: "from-xai" }],
    stop_reason: "end_turn",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("aiRouter — getActiveProvider", () => {
  it("defaults to 'anthropic' when the settings row doesn't exist", async () => {
    db.get.mockResolvedValueOnce(null);
    expect(await aiRouter.getActiveProvider()).toBe("anthropic");
  });

  it("returns 'xai' when settings.value === 'xai'", async () => {
    db.get.mockResolvedValueOnce({ value: "xai" });
    expect(await aiRouter.getActiveProvider()).toBe("xai");
  });

  it("falls back to default on a malformed value", async () => {
    db.get.mockResolvedValueOnce({ value: "openai" });
    expect(await aiRouter.getActiveProvider()).toBe("anthropic");
  });

  it("falls back to default if the DB throws (graceful degradation)", async () => {
    db.get.mockRejectedValueOnce(new Error("DB down"));
    expect(await aiRouter.getActiveProvider()).toBe("anthropic");
  });

  it("caches the value so we don't hit the DB on every chat reply", async () => {
    db.get.mockResolvedValueOnce({ value: "xai" });
    await aiRouter.getActiveProvider();
    await aiRouter.getActiveProvider();
    await aiRouter.getActiveProvider();
    // Three calls, only the first should have hit the DB.
    expect(db.get).toHaveBeenCalledTimes(1);
  });

  it("invalidateProviderCache forces a re-read", async () => {
    db.get.mockResolvedValueOnce({ value: "xai" });
    expect(await aiRouter.getActiveProvider()).toBe("xai");
    aiRouter.invalidateProviderCache();
    db.get.mockResolvedValueOnce({ value: "anthropic" });
    expect(await aiRouter.getActiveProvider()).toBe("anthropic");
    expect(db.get).toHaveBeenCalledTimes(2);
  });
});

describe("aiRouter — createMessage dispatch", () => {
  it("routes to Anthropic when provider is 'anthropic'", async () => {
    db.get.mockResolvedValue(null); // → default anthropic
    const out = await aiRouter.createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      system: "x",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(anthropicClient.createMessage).toHaveBeenCalledTimes(1);
    expect(xaiClient.createXaiMessage).not.toHaveBeenCalled();
    expect(out.content[0].text).toBe("from-anthropic");
  });

  it("routes to xAI when provider is 'xai' and translates the model name", async () => {
    db.get.mockResolvedValue({ value: "xai" });
    const out = await aiRouter.createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      system: "x",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(xaiClient.createXaiMessage).toHaveBeenCalledTimes(1);
    expect(anthropicClient.createMessage).not.toHaveBeenCalled();
    // Any routed Anthropic model → xAI's latency-optimized non-reasoning
    // model. Reasoning was producing >15s replies; non-reasoning is the
    // explicit xAI recommendation for chat workloads.
    expect(xaiClient.createXaiMessage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "grok-4.20-non-reasoning" })
    );
    expect(out.content[0].text).toBe("from-xai");
  });

  it("haiku-class Anthropic model also routes to the same xAI default (no separate tier)", async () => {
    db.get.mockResolvedValue({ value: "xai" });
    await aiRouter.createMessage({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(xaiClient.createXaiMessage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "grok-4.20-non-reasoning" })
    );
  });
});

describe("aiRouter — createMessageWithProvider (force)", () => {
  it("rejects an unknown provider", async () => {
    await expect(
      aiRouter.createMessageWithProvider("openai", { model: "x", messages: [] })
    ).rejects.toThrow(/Invalid provider/);
  });

  it("forces xAI even when the setting says anthropic", async () => {
    db.get.mockResolvedValue({ value: "anthropic" });
    await aiRouter.createMessageWithProvider("xai", {
      model: "claude-sonnet-4-5-20250929",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(xaiClient.createXaiMessage).toHaveBeenCalledTimes(1);
  });

  it("forces Anthropic even when the setting says xai", async () => {
    db.get.mockResolvedValue({ value: "xai" });
    await aiRouter.createMessageWithProvider("anthropic", {
      model: "claude-sonnet-4-5-20250929",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(anthropicClient.createMessage).toHaveBeenCalledTimes(1);
  });
});
