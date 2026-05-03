import { describe, it, expect } from "vitest";
import { diffLines, diffStats } from "./lineDiff";

describe("diffLines — LCS line diff", () => {
  it("identical input → all context rows, both sides equal", () => {
    const { left, right } = diffLines("a\nb\nc", "a\nb\nc");
    expect(left.map((r) => r.kind)).toEqual(["context", "context", "context"]);
    expect(right.map((r) => r.kind)).toEqual(["context", "context", "context"]);
    expect(left.map((r) => r.text)).toEqual(["a", "b", "c"]);
  });

  it("appended line → padding on left, added on right", () => {
    const { left, right } = diffLines("a\nb", "a\nb\nc");
    expect(left.map((r) => r.kind)).toEqual(["context", "context", ""]);
    expect(right.map((r) => r.kind)).toEqual(["context", "context", "added"]);
    expect(right[2].text).toBe("c");
  });

  it("removed line → removed on left, padding on right", () => {
    const { left, right } = diffLines("a\nb\nc", "a\nc");
    expect(left.map((r) => r.kind)).toEqual(["context", "removed", "context"]);
    expect(right.map((r) => r.kind)).toEqual(["context", "", "context"]);
    expect(left[1].text).toBe("b");
  });

  it("changed line → removed-then-added (separate rows)", () => {
    const { left, right } = diffLines("a\nb\nc", "a\nx\nc");
    // LCS finds a + c match; b/x become a removal followed by an addition
    const leftKinds = left.map((r) => r.kind);
    const rightKinds = right.map((r) => r.kind);
    // Either order (b removed first then x added, or vice versa) is valid;
    // both sides should have exactly one removed and one added respectively.
    expect(leftKinds.filter((k) => k === "removed").length).toBe(1);
    expect(rightKinds.filter((k) => k === "added").length).toBe(1);
    expect(leftKinds.filter((k) => k === "context").length).toBe(2);
    expect(rightKinds.filter((k) => k === "context").length).toBe(2);
  });

  it("both sides aligned to the same length", () => {
    const { left, right } = diffLines("a\nb\nc\nd", "a\nx\nc\ny\nz");
    expect(left.length).toBe(right.length);
  });

  it("empty inputs handled safely (treat '' as zero lines)", () => {
    expect(diffLines("", "")).toEqual({ left: [], right: [] });
    expect(diffLines("", "x").left[0].kind).toBe("");
    expect(diffLines("", "x").right[0].kind).toBe("added");
    expect(diffLines("x", "").left[0].kind).toBe("removed");
    expect(diffLines("x", "").right[0].kind).toBe("");
  });

  it("null inputs treated as zero lines", () => {
    expect(diffLines(null, null)).toEqual({ left: [], right: [] });
    expect(diffLines(null, "x").right[0].kind).toBe("added");
  });
});

describe("diffStats", () => {
  it("counts added and removed lines correctly", () => {
    expect(diffStats("a\nb", "a\nb\nc")).toEqual({ added: 1, removed: 0 });
    expect(diffStats("a\nb\nc", "a\nc")).toEqual({ added: 0, removed: 1 });
    expect(diffStats("a\nb\nc", "a\nx\nc")).toEqual({ added: 1, removed: 1 });
    expect(diffStats("same", "same")).toEqual({ added: 0, removed: 0 });
  });
});
