import Anthropic from "@anthropic-ai/sdk";
import logger from "./logger.js";

const anthropic = new Anthropic({
  timeout: 120000, // 2 minute timeout per request
});

/**
 * Wrapper around anthropic.messages.create that retries once on 529 overloaded errors.
 */
export async function createMessage(params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const retryable = [429, 500, 502, 503, 529].includes(err.status);
      if (attempt < 2 && retryable) {
        const delay = (attempt + 1) * 3000;
        logger.warn(`Anthropic API error ${err.status}, retrying in ${delay/1000}s (attempt ${attempt + 1}/3)...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

export default anthropic;
