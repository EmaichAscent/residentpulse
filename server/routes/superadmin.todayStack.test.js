import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level structural guards for the SuperAdmin Today-stack
 * endpoint (PR 7 of the SuperAdmin overhaul). Same pattern as
 * superadmin.blocks.test.js — assert structural facts about the
 * route file rather than spinning up Express against a test DB.
 *
 * The handoff §1 "Today" stack requires four signals; each must be
 * present in the response payload so the dashboard renders all four
 * cards. Regressions where someone removes one of the signals would
 * silently break the dashboard's drill-in flow.
 */

describe("SuperAdmin /today-stack endpoint — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "superadmin.js"), "utf8");
  });

  it("registers GET /today-stack", () => {
    expect(source).toMatch(/router\.get\(\s*"\/today-stack"/);
  });

  it("returns all four signals required by handoff §1", () => {
    expect(source).toMatch(/closing_this_week/);
    expect(source).toMatch(/active_rounds/);
    expect(source).toMatch(/dormant_with_active/);
    expect(source).toMatch(/prompts_recent/);
  });

  it("computes a delta on active_rounds (vs 7 days ago)", () => {
    // Active-rounds card per handoff: "Active rounds: 5 — down from 7
    // last week". Without `last_week` and `delta` the UI cannot render
    // the trend annotation.
    expect(source).toMatch(/last_week/);
    expect(source).toMatch(/delta/);
  });

  it("dormant signal joins clients with active rounds + 14-day login gate", () => {
    // The whole point of this signal is the silent-churn case: a client
    // has an active round but their admin has gone dark. If the JOIN to
    // survey_rounds drops or the 14-day interval changes, the signal
    // stops working.
    expect(source).toMatch(/JOIN survey_rounds/);
    expect(source).toMatch(/'14 days'/);
  });

  it("closing-this-week sample includes round + client metadata for drill-in", () => {
    // The sample rows must carry enough info for the UI to render a
    // "ClientName — Round 4 closes in 2 days" line and link through.
    expect(source).toMatch(/sr\.round_number/);
    expect(source).toMatch(/c\.company_name/);
    expect(source).toMatch(/days_left/);
  });

  it("excludes test rounds from the active-rounds count", () => {
    // is_test = FALSE filter MUST be present; otherwise mock-survey
    // sessions inflate the operator's view.
    expect(source).toMatch(/is_test = FALSE/);
  });

  it("limits sample arrays to a small N to keep payload fast", () => {
    // The sample arrays drive the drill-in lists shown in each card —
    // they should not be unbounded. LIMIT 5 is the design ceiling.
    expect(source).toMatch(/LIMIT 5/);
  });
});
