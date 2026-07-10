import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Phase A of the Zoho-parity build (docs/ZOHO_PARITY_PLAN.md) is pure
// schema — no behavior. These tests pin the structural contract other
// phases build on: table presence, idempotency, the enums the app
// layer relies on, and the uniqueness rules that make answers and
// versions trustworthy.

describe("add-zoho-parity-foundation migration", () => {
  let sql;
  beforeAll(async () => {
    const migrationPath = join(__dirname, "add-zoho-parity-foundation.sql");
    sql = await readFile(migrationPath, "utf8");
  });

  const TABLES = [
    "managers",
    "bookkeepers",
    "survey_questions",
    "survey_triggers",
    "survey_templates",
    "survey_template_questions",
    "survey_template_question_triggers",
    "survey_template_versions",
    "survey_answers",
  ];

  it("creates all nine foundation tables", () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
  });

  it("is idempotent — every CREATE uses IF NOT EXISTS", () => {
    const creates = sql.match(/CREATE (TABLE|INDEX)/gi) || [];
    const guarded = sql.match(/CREATE (TABLE|INDEX) IF NOT EXISTS/gi) || [];
    expect(creates.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(creates.length);
  });

  it("is idempotent — every ADD COLUMN uses IF NOT EXISTS", () => {
    const adds = sql.match(/ADD COLUMN/gi) || [];
    const guarded = sql.match(/ADD COLUMN IF NOT EXISTS/gi) || [];
    expect(adds.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(adds.length);
  });

  it("never drops or renames anything (additive-only guarantee)", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
  });

  it("adds manager_id and bookkeeper_id FKs to communities", () => {
    expect(sql).toMatch(
      /ALTER TABLE communities ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES managers\(id\)/
    );
    expect(sql).toMatch(
      /ALTER TABLE communities ADD COLUMN IF NOT EXISTS bookkeeper_id INTEGER REFERENCES bookkeepers\(id\)/
    );
  });

  it("user-facing data tables carry is_test", () => {
    // Test-mode plumbing is mandatory for any table user data flows
    // through (established convention, see add-test-mode.sql).
    for (const table of ["managers", "bookkeepers", "survey_answers"]) {
      const block = sql
        .split(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))[1]
        .split(");")[0];
      expect(block, `${table} must carry is_test`).toMatch(/is_test BOOLEAN DEFAULT FALSE/);
    }
  });

  it("pins the entity_target and answer_format enums the app layer depends on", () => {
    expect(sql).toMatch(/entity_target IN \('company', 'manager', 'bookkeeper', 'community'\)/);
    expect(sql).toMatch(
      /answer_format IN \('nps', 'likert5', 'multi_select', 'yes_no', 'open_text'\)/
    );
  });

  it("pins the tier enum and retire semantics on template questions", () => {
    expect(sql).toMatch(/tier IN \('required', 'contextual'\)/);
    const block = sql
      .split(/CREATE TABLE IF NOT EXISTS survey_template_questions\b/)[1]
      .split(");")[0];
    expect(block).toMatch(/status IN \('active', 'retired'\)/);
    expect(block).toMatch(/retired_at TIMESTAMP/);
  });

  it("pins answer status and source enums", () => {
    const block = sql.split(/CREATE TABLE IF NOT EXISTS survey_answers\b/)[1].split(");")[0];
    expect(block).toMatch(/status IN \('answered', 'skipped'\)/);
    expect(block).toMatch(/source IN \('widget', 'import_zoho'\)/);
  });

  it("enforces one answer per (session, question)", () => {
    const block = sql.split(/CREATE TABLE IF NOT EXISTS survey_answers\b/)[1].split(");")[0];
    expect(block).toMatch(/UNIQUE\(session_id, question_id\)/);
  });

  it("enforces one entry per (template, question) in drafts", () => {
    const block = sql
      .split(/CREATE TABLE IF NOT EXISTS survey_template_questions\b/)[1]
      .split(");")[0];
    expect(block).toMatch(/UNIQUE\(template_id, question_id\)/);
  });

  it("enforces unique version numbers per template", () => {
    const block = sql
      .split(/CREATE TABLE IF NOT EXISTS survey_template_versions\b/)[1]
      .split(");")[0];
    expect(block).toMatch(/UNIQUE\(template_id, version_number\)/);
  });

  it("question codes are globally unique", () => {
    const block = sql.split(/CREATE TABLE IF NOT EXISTS survey_questions\b/)[1].split(");")[0];
    expect(block).toMatch(/code TEXT NOT NULL UNIQUE/);
  });

  it("published versions store the full config snapshot", () => {
    const block = sql
      .split(/CREATE TABLE IF NOT EXISTS survey_template_versions\b/)[1]
      .split(");")[0];
    expect(block).toMatch(/config_jsonb JSONB NOT NULL/);
  });

  it("is wired into db.js startup", async () => {
    const dbJs = await readFile(join(__dirname, "..", "db.js"), "utf8");
    expect(dbJs).toMatch(/add-zoho-parity-foundation\.sql/);
    expect(dbJs).toMatch(/Zoho-parity foundation migration applied successfully/);
  });
});
