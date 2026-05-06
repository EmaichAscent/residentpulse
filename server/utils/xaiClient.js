import logger from "./logger.js";

/**
 * xAI (Grok) API client.
 *
 * xAI exposes an OpenAI-compatible REST API at https://api.x.ai/v1, so
 * we don't need the openai SDK — just fetch with the right headers.
 *
 * The function below takes the SAME parameter shape as
 * @anthropic-ai/sdk's `messages.create({...})` and returns the SAME
 * response shape (`{content: [{type: "text", text}], stop_reason, ...}`).
 * That lets aiRouter.js and every existing caller swap providers
 * without changing their request- or response-handling code.
 *
 * Translation summary:
 *
 *   Anthropic input shape           xAI (OpenAI) input shape
 *   ─────────────────────           ────────────────────────
 *   { model, max_tokens,            { model, max_tokens,
 *     system: "...",                  messages: [
 *     messages: [                       {role:"system", content:"..."},
 *       {role:"user", content:""},      {role:"user",   content:""},
 *       ...                             ...
 *     ]                               ]
 *   }                               }
 *
 *   Anthropic output shape          xAI (OpenAI) output shape
 *   ──────────────────────          ─────────────────────────
 *   { content: [{                   { choices: [{
 *       type:"text", text:"..."}],     message: {role,content},
 *     stop_reason:"end_turn",          finish_reason:"stop"
 *     model, usage }                 }],
 *                                    model, usage }
 *
 * We accept Anthropic-shaped input and return Anthropic-shaped output —
 * xAI-specific fields are normalized internally.
 *
 * Auth: requires XAI_API_KEY env var. Set it in Railway's variables tab
 * before flipping the SuperAdmin "AI provider" toggle to "xai".
 */

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 120_000; // match anthropicClient

/**
 * Map an Anthropic model name to a sensible xAI counterpart.
 * Used only when the caller passes its current Anthropic model literal.
 * The router can override this by passing `model` directly.
 */
export function defaultXaiModelFor(anthropicModel = "") {
  // Haiku-class (fast classifiers, alert detection) → grok-3-mini-fast
  if (/haiku/i.test(anthropicModel)) return "grok-3-mini-fast";
  // Default everything else (Sonnet, Opus, unknown) → flagship grok-4
  return "grok-4-latest";
}

/**
 * Anthropic→OpenAI request translation.
 */
function toOpenAiRequest(anthropicParams) {
  const messages = [];
  if (anthropicParams.system) {
    messages.push({ role: "system", content: anthropicParams.system });
  }
  for (const m of anthropicParams.messages || []) {
    // Anthropic messages can have content as a string OR an array of
    // content blocks ([{type:"text", text:"..."}]). Flatten to plain
    // strings — xAI doesn't accept Anthropic's content-block format.
    let content;
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .filter((c) => c && c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n");
    } else {
      content = "";
    }
    messages.push({ role: m.role, content });
  }

  return {
    model: anthropicParams.model || "grok-4-latest",
    max_tokens: anthropicParams.max_tokens,
    messages,
    // Pass through optional sampling params if the caller set them.
    ...(anthropicParams.temperature != null && { temperature: anthropicParams.temperature }),
    ...(anthropicParams.top_p != null && { top_p: anthropicParams.top_p }),
  };
}

/**
 * OpenAI→Anthropic response translation.
 */
function toAnthropicResponse(openAiData) {
  const choice = openAiData.choices?.[0];
  const text = choice?.message?.content || "";
  const finishReason = choice?.finish_reason || "stop";
  // Anthropic's "stop_reason" vocabulary differs from OpenAI's
  // "finish_reason"; map the common cases.
  const stopReason =
    finishReason === "stop" ? "end_turn" : finishReason === "length" ? "max_tokens" : finishReason;

  return {
    id: openAiData.id || null,
    type: "message",
    role: "assistant",
    model: openAiData.model || null,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      // Anthropic shape: input_tokens / output_tokens
      input_tokens: openAiData.usage?.prompt_tokens ?? null,
      output_tokens: openAiData.usage?.completion_tokens ?? null,
    },
  };
}

/**
 * Make a Grok call. Same retry/backoff semantics as anthropicClient.
 * Throws on persistent failure so the caller's error path is unchanged.
 */
export async function createXaiMessage(params) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to the server environment before flipping " +
        "the AI provider toggle to 'xai'."
    );
  }

  const body = toOpenAiRequest(params);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const res = await fetch(XAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const retryable = [429, 500, 502, 503, 504].includes(res.status);
        if (attempt < 2 && retryable) {
          const delay = (attempt + 1) * 3000;
          logger.warn(
            `xAI API error ${res.status}, retrying in ${delay / 1000}s ` +
              `(attempt ${attempt + 1}/3): ${text.slice(0, 200)}`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        const err = new Error(`xAI ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      return toAnthropicResponse(data);
    } catch (err) {
      if (attempt < 2 && err.name === "AbortError") {
        logger.warn(`xAI API timeout, retrying (attempt ${attempt + 1}/3)`);
        continue;
      }
      throw err;
    }
  }
}
