import Anthropic from "@anthropic-ai/sdk";
import logger from "./logger.js";

const anthropic = new Anthropic();

/**
 * Wrapper around anthropic.messages.create that retries once on 529 overloaded errors.
 */
export async function createMessage(params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      if (attempt === 0 && err.status === 529) {
        logger.warn("Anthropic API overloaded (529), retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

export default anthropic;
