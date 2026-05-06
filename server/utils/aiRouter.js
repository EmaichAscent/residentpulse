import db from "../db.js";
import { createMessage as createAnthropicMessage } from "./anthropicClient.js";
import { createXaiMessage, defaultXaiModelFor } from "./xaiClient.js";
import logger from "./logger.js";

/**
 * AI provider router. Reads the `ai_provider` global setting and
 * dispatches createMessage() to either Anthropic or xAI.
 *
 * Both providers expose the SAME function signature and response shape
 * (Anthropic-flavored), so callers can swap from
 *
 *     import { createMessage } from "../utils/anthropicClient.js";
 *
 * to
 *
 *     import { createMessage } from "../utils/aiRouter.js";
 *
 * with no other changes. The router decides at request time which
 * vendor to use, based on the value in `settings.ai_provider`.
 *
 * Setting values:
 *   "anthropic"  → Anthropic Claude (default — same behavior as before
 *                  the router existed)
 *   "xai"        → xAI Grok (requires XAI_API_KEY in the environment)
 *
 * Caching: the setting is read once and cached for CACHE_TTL_MS to
 * avoid a DB hit per chat reply. Switching the toggle in SuperAdmin
 * takes effect on the next chat after the cache expires (max
 * CACHE_TTL_MS seconds).
 *
 * Critical-alert detector and other classifier-style background calls
 * intentionally do NOT use this router — they call anthropicClient
 * directly, since fast classification doesn't benefit from provider
 * switching and we want to keep their cost on Haiku.
 */

const PROVIDER_SETTING_KEY = "ai_provider";
const VALID_PROVIDERS = new Set(["anthropic", "xai"]);
const DEFAULT_PROVIDER = "anthropic";

// Cache for the active provider. The setting changes rarely (operator
// toggles in the SuperAdmin UI); per-chat-reply DB hits are wasteful.
const CACHE_TTL_MS = 30_000;
let cachedProvider = null;
let cachedAt = 0;

/**
 * Read the active provider from settings. Falls back to DEFAULT_PROVIDER
 * on any DB error so a transient outage doesn't break chat.
 */
export async function getActiveProvider() {
  const now = Date.now();
  if (cachedProvider && now - cachedAt < CACHE_TTL_MS) {
    return cachedProvider;
  }
  try {
    const row = await db.get("SELECT value FROM settings WHERE key = ? AND client_id IS NULL", [
      PROVIDER_SETTING_KEY,
    ]);
    const v = (row?.value || "").toLowerCase().trim();
    cachedProvider = VALID_PROVIDERS.has(v) ? v : DEFAULT_PROVIDER;
    cachedAt = now;
    return cachedProvider;
  } catch (err) {
    logger.warn({ err }, "aiRouter: failed to read ai_provider setting, using default");
    return DEFAULT_PROVIDER;
  }
}

/**
 * Force-clear the provider cache. Called by the SuperAdmin PUT
 * endpoint after writing a new value, so the change is visible
 * immediately rather than waiting for the cache TTL.
 */
export function invalidateProviderCache() {
  cachedProvider = null;
  cachedAt = 0;
}

/**
 * createMessage — same signature as @anthropic-ai/sdk's
 * messages.create({}). Dispatches based on the active provider.
 *
 * When the active provider is "xai", we translate the Anthropic-named
 * model in `params.model` to a sensible Grok equivalent
 * (Sonnet → grok-4-latest, Haiku → grok-3-mini-fast). Callers don't
 * need to know which provider they're hitting.
 */
export async function createMessage(params) {
  const provider = await getActiveProvider();
  if (provider === "xai") {
    const xaiParams = {
      ...params,
      model: defaultXaiModelFor(params.model),
    };
    return createXaiMessage(xaiParams);
  }
  return createAnthropicMessage(params);
}

/**
 * Force a specific provider for one call, bypassing the setting.
 * Useful for ad-hoc A/B testing in scripts; not used by the runtime.
 */
export async function createMessageWithProvider(provider, params) {
  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `Invalid provider "${provider}". Must be one of: ${[...VALID_PROVIDERS].join(", ")}`
    );
  }
  if (provider === "xai") {
    return createXaiMessage({ ...params, model: defaultXaiModelFor(params.model) });
  }
  return createAnthropicMessage(params);
}
