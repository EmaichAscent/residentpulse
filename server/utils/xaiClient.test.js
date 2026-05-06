import { describe, it, expect, vi, afterEach } from "vitest";
import { createXaiMessage, defaultXaiModelFor } from "./xaiClient.js";

// xaiClient hits a real HTTPS endpoint. Mock global fetch for tests.

describe("defaultXaiModelFor", () => {
  const originalModel = process.env.XAI_MODEL;
  afterEach(() => {
    if (originalModel === undefined) delete process.env.XAI_MODEL;
    else process.env.XAI_MODEL = originalModel;
  });

  // grok-4.20-non-reasoning is xAI's explicit recommendation for
  // latency-sensitive workloads. Reasoning is off at the model level,
  // which is critical — reasoning-on grok-4.3 was producing >15s
  // replies in production NPS chats.
  it("returns grok-4.20-non-reasoning by default for any Anthropic model name", () => {
    delete process.env.XAI_MODEL;
    expect(defaultXaiModelFor("claude-sonnet-4-5-20250929")).toBe("grok-4.20-non-reasoning");
    expect(defaultXaiModelFor("claude-opus-4")).toBe("grok-4.20-non-reasoning");
    expect(defaultXaiModelFor("claude-haiku-4-5-20251001")).toBe("grok-4.20-non-reasoning");
    expect(defaultXaiModelFor("")).toBe("grok-4.20-non-reasoning");
    expect(defaultXaiModelFor(undefined)).toBe("grok-4.20-non-reasoning");
  });

  it("honors XAI_MODEL env override when set", () => {
    process.env.XAI_MODEL = "grok-4.3";
    expect(defaultXaiModelFor("claude-sonnet-4-5-20250929")).toBe("grok-4.3");
    process.env.XAI_MODEL = "grok-4.20-reasoning";
    expect(defaultXaiModelFor()).toBe("grok-4.20-reasoning");
  });

  it("falls back to default when XAI_MODEL is empty string", () => {
    process.env.XAI_MODEL = "";
    expect(defaultXaiModelFor()).toBe("grok-4.20-non-reasoning");
  });
});

describe("createXaiMessage", () => {
  const originalKey = process.env.XAI_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("throws a clear error when XAI_API_KEY is not set", async () => {
    delete process.env.XAI_API_KEY;
    await expect(
      createXaiMessage({ model: "grok-4.3-latest", max_tokens: 100, messages: [] })
    ).rejects.toThrow(/XAI_API_KEY is not set/);
  });

  it("translates Anthropic-shaped input → OpenAI-shaped request body", async () => {
    process.env.XAI_API_KEY = "test-key";

    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "x1",
            choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
            model: "grok-4.3-latest",
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        };
      })
    );

    await createXaiMessage({
      model: "grok-4.3-latest",
      max_tokens: 200,
      system: "You are a board interviewer.",
      messages: [{ role: "user", content: "My NPS is 7." }],
    });

    expect(capturedBody.model).toBe("grok-4.3-latest");
    expect(capturedBody.max_tokens).toBe(200);
    expect(capturedBody.messages).toEqual([
      { role: "system", content: "You are a board interviewer." },
      { role: "user", content: "My NPS is 7." },
    ]);
  });

  it("normalizes OpenAI-shaped response → Anthropic-shaped output", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: "x42",
          choices: [
            {
              message: { role: "assistant", content: "A 7 — what's the biggest gap?" },
              finish_reason: "stop",
            },
          ],
          model: "grok-4.3-latest",
          usage: { prompt_tokens: 100, completion_tokens: 12 },
        }),
      }))
    );

    const out = await createXaiMessage({
      model: "grok-4.3-latest",
      max_tokens: 200,
      messages: [{ role: "user", content: "7" }],
    });

    // The shape MUST match what Anthropic SDK callers expect, so every
    // existing `response.content[0].text` access keeps working.
    expect(out.content).toEqual([{ type: "text", text: "A 7 — what's the biggest gap?" }]);
    expect(out.stop_reason).toBe("end_turn");
    expect(out.usage).toEqual({ input_tokens: 100, output_tokens: 12 });
    expect(out.model).toBe("grok-4.3-latest");
  });

  it("maps OpenAI finish_reason='length' → Anthropic 'max_tokens'", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "truncated" }, finish_reason: "length" }],
        }),
      }))
    );
    const out = await createXaiMessage({ messages: [{ role: "user", content: "x" }] });
    expect(out.stop_reason).toBe("max_tokens");
  });

  it("throws on non-retryable HTTP error with the response body included", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid API key",
      }))
    );
    await expect(createXaiMessage({ messages: [{ role: "user", content: "x" }] })).rejects.toThrow(
      /401.*Invalid API key/
    );
  });

  it("flattens content-block message arrays into plain strings (Anthropic compat)", async () => {
    process.env.XAI_API_KEY = "test-key";
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
        };
      })
    );

    await createXaiMessage({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Line 1" },
            { type: "text", text: "Line 2" },
          ],
        },
      ],
    });

    expect(capturedBody.messages[0].content).toBe("Line 1\nLine 2");
  });
});
