import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level structural guards for the SuperAdmin Prompts Library
 * block endpoints (PR 2 of the SuperAdmin redesign series).
 *
 * Same testing pattern as superadmin.versioning.test.js — we assert
 * structural facts about the route file rather than spinning up
 * Express against a test DB. Catches regressions like "someone
 * removed the VERSIONED_PROMPT_KEYS check" or "someone forgot to
 * call autoSaveVersion on the block-write path."
 */

describe("SuperAdmin block endpoints — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "superadmin.js"), "utf8");
  });

  it("imports the block helpers from prompts/blocks + utils/promptVersions", () => {
    expect(source).toMatch(/from\s+"\.\.\/utils\/promptVersions\.js"/);
    expect(source).toMatch(/from\s+"\.\.\/prompts\/blocks\.js"/);
    expect(source).toMatch(/getCurrentBlocks/);
    expect(source).toMatch(/saveNewVersion/);
    expect(source).toMatch(/getVersionById/);
    expect(source).toMatch(/blocksToPrompt/);
    expect(source).toMatch(/normalizeBlock/);
  });

  it("registers GET /prompts/:key/blocks", () => {
    expect(source).toMatch(/router\.get\(\s*"\/prompts\/:key\/blocks"/);
  });

  it("registers PUT /prompts/:key/blocks", () => {
    expect(source).toMatch(/router\.put\(\s*"\/prompts\/:key\/blocks"/);
  });

  it("registers GET /prompts/:key/versions/:id/blocks", () => {
    expect(source).toMatch(/router\.get\(\s*"\/prompts\/:key\/versions\/:id\/blocks"/);
  });

  it("PUT /prompts/:key/blocks rejects invalid prompt keys via the existing allowlist", () => {
    // Find the PUT /prompts/:key/blocks block + check it gates on
    // VERSIONED_PROMPT_KEYS like the legacy text endpoints do.
    const put = source.slice(
      source.indexOf('router.put(\n    "/prompts/:key/blocks"') === -1
        ? source.indexOf('router.put("/prompts/:key/blocks"')
        : source.indexOf('router.put(\n    "/prompts/:key/blocks"'),
      source.indexOf('router.get("/prompts/:key/versions/:id/blocks"')
    );
    expect(put).toMatch(/VERSIONED_PROMPT_KEYS/);
    expect(put).toMatch(/Invalid prompt key/);
  });

  it("PUT /prompts/:key/blocks validates blocks payload as non-empty array", () => {
    expect(source).toMatch(/Array\.isArray\(blocks\)\s*\|\|\s*blocks\.length === 0/);
    expect(source).toMatch(/blocks \(non-empty array\) is required/);
  });

  it("PUT /prompts/:key/blocks is idempotent: short-circuits when assembled text matches current settings value", () => {
    expect(source).toMatch(/currentSetting\?\.value === assembledText/);
  });

  it("PUT /prompts/:key/blocks auto-saves the previous value before overwriting", () => {
    expect(source).toMatch(/Auto-saved before structured-block edit/);
    expect(source).toMatch(/Auto-save \(pre-edit\)/);
  });

  it("PUT /prompts/:key/blocks updates settings.value with the assembled text after save", () => {
    expect(source).toMatch(/UPDATE settings SET value = \? WHERE key = \? AND client_id IS NULL/);
  });

  it("GET /prompts/:key/versions/:id/blocks rejects mismatched prompt_key", () => {
    expect(source).toMatch(/Version belongs to a different prompt key/);
  });
});

describe("promptVersions helper module — structural guards", () => {
  let source;
  beforeAll(async () => {
    const helperPath = join(__dirname, "..", "utils", "promptVersions.js");
    source = await readFile(helperPath, "utf8");
  });

  it("exports the public API surface used by the routes", () => {
    expect(source).toMatch(/export function rowToVersion/);
    expect(source).toMatch(/export async function listVersionsForKey/);
    expect(source).toMatch(/export async function getVersionById/);
    expect(source).toMatch(/export async function getCurrentBlocks/);
    expect(source).toMatch(/export async function saveNewVersion/);
    expect(source).toMatch(/export async function nextVersionNumber/);
  });

  it("rowToVersion falls back to parsePromptToBlocks when blocks_jsonb is null", () => {
    // Defends back-compat with all rows that pre-date the column.
    expect(source).toMatch(/if \(!blocks && row\.prompt_text\)/);
    expect(source).toMatch(/parsePromptToBlocks\(row\.prompt_text\)/);
  });

  it("rowToVersion handles jsonb returned as either string or object", () => {
    // PG normally hydrates jsonb, but some drivers / raw queries return strings.
    expect(source).toMatch(/typeof raw === "string"/);
    expect(source).toMatch(/JSON\.parse\(raw\)/);
  });

  it("saveNewVersion accepts EITHER blocks or promptText (preferring blocks)", () => {
    expect(source).toMatch(/Array\.isArray\(blocks\) && blocks\.length > 0/);
    expect(source).toMatch(/typeof promptText === "string" && promptText\.length > 0/);
    expect(source).toMatch(/saveNewVersion requires either blocks or promptText/);
  });

  it("saveNewVersion auto-increments version_number per prompt_key", () => {
    expect(source).toMatch(/await nextVersionNumber\(promptKey\)/);
  });

  it("saveNewVersion persists BOTH blocks_jsonb AND assembled prompt_text", () => {
    // So legacy text-only readers (chat.js / interview.js) keep working
    // unchanged after a structured-editor save.
    expect(source).toMatch(
      /INSERT INTO prompt_versions\s*\n\s*\(prompt_key, prompt_text, blocks_jsonb/
    );
  });

  it("nextVersionNumber returns max+1 (or 1 when no rows exist)", () => {
    expect(source).toMatch(/SELECT MAX\(version_number\) AS max_v/);
    expect(source).toMatch(/return \(row\?\.max_v \?\? 0\) \+ 1/);
  });

  it("getCurrentBlocks reads from settings.value (runtime source of truth)", () => {
    expect(source).toMatch(/SELECT value FROM settings WHERE key = \? AND client_id IS NULL/);
  });
});

describe("add-prompt-versions-blocks migration", () => {
  let sql;
  beforeAll(async () => {
    const migrationPath = join(__dirname, "..", "migrations", "add-prompt-versions-blocks.sql");
    sql = await readFile(migrationPath, "utf8");
  });

  it("adds blocks_jsonb, note, version_number columns idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS blocks_jsonb JSONB/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS note\s+TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS version_number INTEGER/);
  });

  it("creates an index that supports max(version_number) per key lookups", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_prompt_versions_key_version/);
    expect(sql).toMatch(/version_number DESC NULLS LAST/);
  });

  it("does NOT make any of the new columns NOT NULL (back-compat)", () => {
    // Existing rows pre-date these columns and should be allowed to
    // stay NULL until they're touched again.
    expect(sql).not.toMatch(/blocks_jsonb\s+JSONB\s+NOT NULL/i);
    expect(sql).not.toMatch(/note\s+TEXT\s+NOT NULL/i);
    expect(sql).not.toMatch(/version_number\s+INTEGER\s+NOT NULL/i);
  });
});

describe("db.js — wires the new migration into startup", () => {
  let source;
  beforeAll(async () => {
    const dbPath = join(__dirname, "..", "db.js");
    source = await readFile(dbPath, "utf8");
  });

  it("loads add-prompt-versions-blocks.sql in the boot sequence", () => {
    expect(source).toMatch(/add-prompt-versions-blocks\.sql/);
    expect(source).toMatch(/Prompt versions blocks migration applied successfully/);
  });
});
