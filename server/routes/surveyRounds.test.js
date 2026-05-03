import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level guards for the surveyRounds route file.
 *
 * Same pattern as actions.test.js — until we have a route-level
 * integration harness against a test DB, these structural checks
 * catch regressions in the analytics surface that drives Trends,
 * Round Results, Home, and Communities. Wrong filter here = the
 * whole dashboard suite drifts out of sync (which is exactly what
 * happened to the Communities at-risk number before this PR).
 */
describe("surveyRounds route — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "surveyRounds.js"), "utf8");
  });

  // ── Per-community NPS shape (Communities sentiment bar fix) ─────────
  describe("dashboard endpoint /:id/dashboard", () => {
    it("computes per-community detractors / passives / promoters / nps in community_cohorts", () => {
      // The Communities page reads these fields directly off the
      // dashboard's community_cohorts entries to render the
      // sentiment split bar. Missing any of them silently breaks
      // the bar (regression we already fixed once).
      expect(source).toMatch(/communityCohorts\.push\(\{[\s\S]*?\bnps\b/);
      expect(source).toMatch(/communityCohorts\.push\(\{[\s\S]*?\bpromoters\b/);
      expect(source).toMatch(/communityCohorts\.push\(\{[\s\S]*?\bpassives\b/);
      expect(source).toMatch(/communityCohorts\.push\(\{[\s\S]*?\bdetractors\b/);
    });

    it("at-risk filter uses cohort === 'detractor' AND has contract_value", () => {
      // Source of truth for Home + Round Results revenue_at_risk.
      // Communities page mirrors this filter — drifting them apart
      // is the bug we just shipped a fix for.
      expect(source).toMatch(/c\.cohort === "detractor" && c\.contract_value/);
    });

    it("loads the immediately-prior concluded round for prev/change", () => {
      expect(source).toMatch(/round_number < \?/);
      expect(source).toMatch(/ORDER BY round_number DESC LIMIT 1/);
      expect(source).toMatch(/computeRoundManagerLocationPerf/);
    });

    it("attaches prev + change to manager_performance and location_performance", () => {
      const guard = source.indexOf("attachPrevChange(communityAnalytics.manager_performance");
      expect(guard).toBeGreaterThan(-1);
      expect(source).toMatch(/attachPrevChange\(communityAnalytics\.location_performance/);
    });
  });

  // ── Trends endpoint post-pass ───────────────────────────────────────
  describe("trends endpoint /trends", () => {
    it("walks chronologically and attaches prev/change to manager/location/size", () => {
      // The frontend ManagerLocationDeltasCard already renders the
      // change pill when present — these calls are what light it up.
      expect(source).toMatch(
        /attachPrevChange\(cur\.manager_performance, prev\.manager_performance/
      );
      expect(source).toMatch(
        /attachPrevChange\(cur\.location_performance, prev\.location_performance/
      );
      expect(source).toMatch(/attachPrevChange\(cur\.size_performance, prev\.size_performance/);
    });

    it("computes dual_detractors and dual_promoters when ≥ 2 rounds exist", () => {
      expect(source).toMatch(/trendsData\.length >= 2/);
      expect(source).toMatch(/dual_detractors/);
      expect(source).toMatch(/dual_promoters/);
    });

    it("dual cohorts require ≥ 2 consecutive rounds in the same extreme cohort", () => {
      expect(source).toMatch(/consecutive < 2/);
      expect(source).toMatch(/last\.cohort !== "detractor" && last\.cohort !== "promoter"/);
    });

    it("dual_detractors sort by run length, then by ARR-at-risk highest first", () => {
      expect(source).toMatch(
        /b\.consecutive_rounds - a\.consecutive_rounds[\s\S]+?\(b\.contract_value \|\| 0\) - \(a\.contract_value \|\| 0\)/
      );
    });

    it("attaches dual cohorts only to the latest round (not every round)", () => {
      // Avoid leaking dual_detractors into older rounds — that
      // would imply the Trends UI could show "dual" for stale data.
      expect(source).toMatch(/latest\.dual_detractors = dualDetractors/);
      expect(source).toMatch(/latest\.dual_promoters = dualPromoters/);
    });
  });

  // ── attachPrevChange helper ─────────────────────────────────────────
  describe("attachPrevChange helper", () => {
    it("only writes prev/change when both current and prev NPS are present", () => {
      const start = source.indexOf("function attachPrevChange");
      const body = source.slice(start, source.indexOf("\nfunction ", start + 1));
      expect(body).toMatch(/prevNps != null && c\.nps != null/);
    });

    it("is null-safe against non-array inputs (older rounds without analytics)", () => {
      const start = source.indexOf("function attachPrevChange");
      const body = source.slice(start, source.indexOf("\nfunction ", start + 1));
      expect(body).toMatch(/Array\.isArray\(curList\) \|\| !Array\.isArray\(prevList\)/);
    });
  });
});
