import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level guard rails for the prompt-versioning endpoints.
 *
 * We assert structural facts about the route file rather than running
 * Express against a test DB — until we set up a dedicated test-DB harness,
 * these guards catch regressions like "someone removed key validation" or
 * "someone forgot to auto-save a version on write."
 */
describe("superadmin versioning endpoints — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "superadmin.js"), "utf8");
  });

  it("declares the VERSIONED_PROMPT_KEYS allowlist with all four prompts", () => {
    expect(source).toMatch(/VERSIONED_PROMPT_KEYS\s*=\s*\[/);
    expect(source).toMatch(/"system_prompt"/);
    expect(source).toMatch(/"interview_initial_prompt"/);
    expect(source).toMatch(/"interview_re_prompt"/);
    expect(source).toMatch(/"prompt_generation_instruction"/);
  });

  it("autoSaveVersion helper writes prompt_key alongside prompt_text", () => {
    const fnStart = source.indexOf("async function autoSaveVersion");
    expect(fnStart).toBeGreaterThan(-1);
    const body = source.slice(fnStart, source.indexOf("\n}\n", fnStart));
    expect(body).toMatch(
      /INSERT INTO prompt_versions \(prompt_key, prompt_text, label, created_by\)/
    );
  });

  it("PUT /interview-prompts auto-saves before update (regression: was missing pre-PR2)", () => {
    const start = source.indexOf('router.put("/interview-prompts"');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/autoSaveVersion\(/);
  });

  it("PUT /prompt also auto-saves before update", () => {
    const start = source.indexOf('router.put("/prompt"');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/autoSaveVersion\(/);
  });

  it("GET /prompt/versions accepts a key query param and validates it", () => {
    const start = source.indexOf('router.get("/prompt/versions"');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/req\.query\.key/);
    expect(body).toMatch(/VERSIONED_PROMPT_KEYS\.includes/);
    expect(body).toMatch(/WHERE prompt_key = \?/);
  });

  it("POST /prompt/versions accepts a key in the body and validates it", () => {
    const start = source.indexOf('router.post("/prompt/versions"');
    expect(start).toBeGreaterThan(-1);
    // Match this endpoint specifically (not /prompt/versions/:id/restore which comes later)
    const body = source.slice(start, source.indexOf('router.delete("/prompt/versions/:id"', start));
    expect(body).toMatch(/req\.body\.key/);
    expect(body).toMatch(/VERSIONED_PROMPT_KEYS\.includes/);
    expect(body).toMatch(
      /INSERT INTO prompt_versions \(prompt_key, prompt_text, label, created_by\)/
    );
  });

  it("POST /prompt/versions/:id/restore exists and updates settings + auto-saves", () => {
    const start = source.indexOf('router.post("/prompt/versions/:id/restore"');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.length);
    expect(body).toMatch(/SELECT \* FROM prompt_versions WHERE id/);
    expect(body).toMatch(/autoSaveVersion\(/);
    expect(body).toMatch(/UPDATE settings SET value = \?/);
  });

  it("DELETE /prompt/versions/:id still exists (backward compat)", () => {
    expect(source).toMatch(/router\.delete\("\/prompt\/versions\/:id"/);
  });
});
