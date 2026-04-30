import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLiveWordFrequencies } from "./wordFrequencies.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("computeLiveWordFrequencies", () => {
  it("returns empty array for no messages", () => {
    expect(computeLiveWordFrequencies([])).toEqual([]);
  });

  it("filters out single mentions (count > 1 only)", () => {
    const messages = [{ content: "elevator broken" }, { content: "garage flooded" }];
    const result = computeLiveWordFrequencies(messages);
    // No word repeats → all filtered out
    expect(result).toEqual([]);
  });

  it("filters out stop words", () => {
    const messages = [
      { content: "the the the and and and a a a" },
      { content: "the the the and and and a a a" },
    ];
    expect(computeLiveWordFrequencies(messages)).toEqual([]);
  });

  it("counts and sorts repeated words descending", () => {
    const messages = [
      { content: "elevator elevator elevator garage garage" },
      { content: "elevator garage flooding flooding" },
    ];
    const result = computeLiveWordFrequencies(messages);
    expect(result[0]).toEqual({ word: "elevator", count: 4 });
    expect(result[1]).toEqual({ word: "garage", count: 3 });
    expect(result[2]).toEqual({ word: "flooding", count: 2 });
  });

  it("filters out words 2 chars or shorter", () => {
    const messages = [
      { content: "ok ok ok hi hi hi elevator elevator" },
      { content: "ok hi elevator" },
    ];
    const result = computeLiveWordFrequencies(messages);
    // ok and hi excluded by length, elevator kept
    expect(result.map((r) => r.word)).toEqual(["elevator"]);
  });

  it("handles missing content gracefully", () => {
    const messages = [{ content: null }, { content: undefined }, {}];
    expect(computeLiveWordFrequencies(messages)).toEqual([]);
  });

  it("strips digits and punctuation when tokenizing", () => {
    const messages = [
      { content: "Apartment 312 had issues!" },
      { content: "Apartment 415 had issues." },
    ];
    const result = computeLiveWordFrequencies(messages);
    // "apartment" appears twice, "had" is a stop word, digits stripped
    expect(result.find((r) => r.word === "apartment")?.count).toBe(2);
    expect(result.find((r) => r.word === "312")).toBeUndefined();
  });

  it("caps results at 40 words", () => {
    // 50 distinct alphabetic-only words, each appearing twice across two messages.
    // No digits (they get stripped). All longer than 2 chars. None in STOP_WORDS.
    const words = Array.from({ length: 50 }, (_, i) => {
      // Build "alpha", "beta", ..., "zeta", then ax/bx/cx... for the remainder
      const base = "alphagammadeltathetalambdasigmaomegakapparhowave";
      return base.slice(0, 5) + String.fromCharCode(97 + (i % 26)) + (i >= 26 ? "x" : "");
    });
    const messages = [{ content: words.join(" ") }, { content: words.join(" ") }];
    const result = computeLiveWordFrequencies(messages);
    expect(result).toHaveLength(40);
  });
});

describe("finalizeStaleSessionsForRound — regression guard", () => {
  it("does not require >= 2 user messages (regression: round 83 finalize bug)", async () => {
    // The bug: auto-finalize used to require `>= 2` user messages, which excluded
    // sessions where the resident gave NPS + 1 comment. We dropped that gate.
    // This test reads the source file and asserts the gate is not back.
    const source = await readFile(join(__dirname, "insightGenerator.js"), "utf8");
    const fnStart = source.indexOf("async function finalizeStaleSessionsForRound");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, source.indexOf("\n}\n", fnStart));
    expect(fnBody).not.toMatch(/>=\s*2/);
    expect(fnBody).not.toMatch(/m\.role\s*=\s*'user'/);
  });
});
