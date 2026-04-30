import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Regression guard for the round-83 Finalize bug.
 *
 * The /sessions/:id/finalize endpoint used to require >= 2 user messages
 * before allowing finalize, which rejected valid NPS responses with only a
 * single comment. We dropped that check. If anyone reintroduces it, this
 * test fails.
 */
describe("/sessions/:id/finalize — regression guard", () => {
  it("does not require >= 2 user messages", async () => {
    const source = await readFile(join(__dirname, "admin.js"), "utf8");
    const finalizeStart = source.indexOf('router.post("/sessions/:id/finalize"');
    expect(finalizeStart).toBeGreaterThan(-1);

    // Endpoint body ends at the next router.* declaration
    const after = source.slice(finalizeStart);
    const endpointBody = after.slice(0, after.indexOf("router.", 1));

    // Must not gate on minimum user-message count
    expect(endpointBody).not.toMatch(/messageCount.*<\s*2/);
    expect(endpointBody).not.toMatch(/count\s*<\s*2/);
  });

  it("still requires an NPS score to finalize", async () => {
    const source = await readFile(join(__dirname, "admin.js"), "utf8");
    const finalizeStart = source.indexOf('router.post("/sessions/:id/finalize"');
    const after = source.slice(finalizeStart);
    const endpointBody = after.slice(0, after.indexOf("router.", 1));

    expect(endpointBody).toMatch(/nps_score/);
  });
});
