import { describe, it, expect } from "vitest";
import {
  COLUMN_TO_CODE,
  normalizeRatingValue,
  effectiveNps,
  parseSubmissionDate,
} from "./zohoImport.js";

// Phase F mapping contract — grounded in the actual Cadden export
// ("Survey Detail Report … 7.2.2026", 709 rows), whose headers and
// value vocabularies these tests pin.

describe("COLUMN_TO_CODE", () => {
  it("maps all 44 non-meta Zoho columns onto seeded catalog codes (NPS comes from the meta columns)", () => {
    expect(Object.keys(COLUMN_TO_CODE)).toHaveLength(44);
    const codes = Object.values(COLUMN_TO_CODE);
    expect(new Set(codes).size).toBe(44); // no double-mapped codes
    // Spot-check each series
    expect(COLUMN_TO_CODE["Value For Services"]).toBe("C01");
    expect(COLUMN_TO_CODE["Effectively Enforces Deed Restrictions"]).toBe("Y01");
    expect(COLUMN_TO_CODE["Knowledgeable"]).toBe("M02");
    expect(COLUMN_TO_CODE["Accuracy of Financials"]).toBe("F01");
    expect(COLUMN_TO_CODE["Change in Board Support"]).toBe("C11");
  });

  it("M01 (Manager overall) is native-only — Zoho never asked it", () => {
    expect(Object.values(COLUMN_TO_CODE)).not.toContain("M01");
  });
});

describe("normalizeRatingValue — the two Zoho vocabularies", () => {
  it("absolute labels map onto the 1–5 likert (join native trends directly)", () => {
    expect(normalizeRatingValue("Excellent")).toEqual({
      kind: "absolute",
      numeric: 5,
      label: "Excellent",
    });
    expect(normalizeRatingValue("Poor")).toEqual({ kind: "absolute", numeric: 2, label: "Poor" });
    expect(normalizeRatingValue("very poor")).toMatchObject({ kind: "absolute", numeric: 1 });
  });

  it("delta labels preserve the label and a signed magnitude", () => {
    expect(normalizeRatingValue("Somewhat Declined")).toEqual({
      kind: "delta",
      delta: -1,
      label: "Somewhat Declined",
    });
    expect(normalizeRatingValue("The Same")).toMatchObject({ kind: "delta", delta: 0 });
    expect(normalizeRatingValue("No Change")).toMatchObject({ kind: "delta", delta: 0 });
    expect(normalizeRatingValue("Greatly Improved")).toMatchObject({ kind: "delta", delta: 2 });
  });

  it("blank cells mean 'not answered' — no row at all", () => {
    expect(normalizeRatingValue("")).toBe(null);
    expect(normalizeRatingValue("   ")).toBe(null);
    expect(normalizeRatingValue(null)).toBe(null);
    expect(normalizeRatingValue(undefined)).toBe(null);
  });

  it("unrecognized labels degrade to 'unknown' instead of crashing the import", () => {
    expect(normalizeRatingValue("N/A - new board member")).toEqual({
      kind: "unknown",
      label: "N/A - new board member",
    });
  });
});

describe("effectiveNps — the score lives in two columns", () => {
  it("prefers the first-round NPS column when present", () => {
    expect(
      effectiveNps({
        "NPS (Survey Information)": "8",
        "Follow Up NPS (Survey Information)": "3",
      })
    ).toBe(8);
  });

  it("falls back to Follow Up NPS (later rounds)", () => {
    expect(
      effectiveNps({
        "NPS (Survey Information)": "",
        "Follow Up NPS (Survey Information)": "2",
      })
    ).toBe(2);
  });

  it("returns null when neither is a valid 0–10 integer", () => {
    expect(effectiveNps({})).toBe(null);
    expect(effectiveNps({ "NPS (Survey Information)": "11" })).toBe(null);
    expect(effectiveNps({ "NPS (Survey Information)": "n/a" })).toBe(null);
  });
});

describe("parseSubmissionDate — the export's MM-DD-YYYY", () => {
  it("converts to ISO", () => {
    expect(parseSubmissionDate("06-16-2026")).toBe("2026-06-16");
  });
  it("rejects anything else rather than guessing", () => {
    expect(parseSubmissionDate("2026-06-16")).toBe(null);
    expect(parseSubmissionDate("6/16/26")).toBe(null);
    expect(parseSubmissionDate("")).toBe(null);
  });
});
