import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level structural guards for the enriched /api/superadmin/clients
 * endpoint (PR 8 of the SuperAdmin overhaul). Same pattern as the other
 * superadmin route tests — we assert that the SQL still pulls the
 * fields the Clients-list health computation needs.
 *
 * Regressions where someone removes one of the enrichment columns
 * (active_round_count, onboarding_complete, last_round_launched_at)
 * would silently degrade the health dot to "good" for everyone.
 */

describe("SuperAdmin /clients endpoint — enrichment guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "superadmin.js"), "utf8");
  });

  it("registers GET /clients", () => {
    expect(source).toMatch(/router\.get\(\s*"\/clients"/);
  });

  it("includes active_round_count subquery (drives Active-rounds chip + dormant flag)", () => {
    expect(source).toMatch(/active_round_count/);
    expect(source).toMatch(/sr\.status = 'in_progress'/);
    expect(source).toMatch(/sr\.is_test = FALSE/);
  });

  it("includes onboarding_complete (drives Onboarding-incomplete chip)", () => {
    expect(source).toMatch(/onboarding_complete/);
    expect(source).toMatch(/BOOL_OR\(ca\.onboarding_completed\)/);
  });

  it("includes last_round_launched_at (drives 'No round ever' health label)", () => {
    expect(source).toMatch(/last_round_launched_at/);
    expect(source).toMatch(/MAX\(launched_at\)/);
  });

  it("preserves last_activity (most recent admin login)", () => {
    expect(source).toMatch(/MAX\(ca\.last_login_at\) as last_activity/);
  });

  it("preserves plan_key on the response (used by plan filter chips)", () => {
    expect(source).toMatch(/sp\.name as plan_key/);
  });

  it("scopes round-count filters to non-test rounds only", () => {
    // is_test = FALSE must apply to BOTH the active-round subquery and
    // the last-launched subquery; otherwise mock-survey rounds inflate
    // the operator's view of who's actually running interviews.
    const isTestFalseCount = (source.match(/sr\.is_test = FALSE/g) || []).length;
    expect(isTestFalseCount).toBeGreaterThanOrEqual(2);
  });
});
