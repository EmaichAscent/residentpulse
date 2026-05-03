/**
 * Tiny LCS-based line diff utility — used by the SuperAdmin Prompts
 * Library version-diff modal (PR 4 of the SuperAdmin overhaul) per
 * the handoff §"Version diff modal" spec:
 *
 *   "Side-by-side two columns. Removed lines: coral-tint background.
 *    Added lines: leaf-tint background. Unchanged: plain."
 *
 * No external dep — full Myers diff is overkill for prompt content
 * which mostly stays the same with small edits. The classic LCS
 * dynamic-programming approach gives clean alignment for our use
 * case in O(n·m) time. For prompts of a few hundred lines that's
 * milliseconds.
 *
 * Output shape:
 *   diffLines(a, b) → { left: [...], right: [...] }
 *
 *   Each side is an array of rows aligned across the two columns.
 *   Rows on the left (from `a`) are tagged:
 *     • "context" — line exists in both (unchanged)
 *     • "removed" — line exists only in `a` (was deleted)
 *     • ""        — placeholder (b has more lines here)
 *   Rows on the right (from `b`) are tagged:
 *     • "context" — line exists in both (unchanged)
 *     • "added"   — line exists only in `b` (was added)
 *     • ""        — placeholder (a has more lines here)
 *
 *   The two arrays are guaranteed to be the same length so the modal
 *   can render them as parallel rows.
 */

/**
 * Compute the LCS-based diff of two text strings, line by line.
 * Returns { left, right } where each is an array of { kind, text }.
 *
 *   kind:
 *     "context" — same line on both sides
 *     "removed" — line is on the left only
 *     "added"   — line is on the right only
 *     ""        — placeholder padding row (visual alignment only)
 */
export function diffLines(a, b) {
  // Empty / null input is treated as zero lines so the modal renders
  // an empty diff cleanly. JavaScript's "".split("\n") returns [""]
  // which would otherwise produce a phantom "empty line" in the diff.
  const aLines = a ? a.split("\n") : [];
  const bLines = b ? b.split("\n") : [];

  // LCS table — lcs[i][j] = length of LCS of aLines[0..i) and bLines[0..j)
  const m = aLines.length;
  const n = bLines.length;
  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Walk the table backwards to produce aligned rows. We collect into
  // reverse order then reverse at the end.
  const left = [];
  const right = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      left.push({ kind: "context", text: aLines[i - 1] });
      right.push({ kind: "context", text: bLines[j - 1] });
      i--;
      j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      // Removal — left has a line right doesn't
      left.push({ kind: "removed", text: aLines[i - 1] });
      right.push({ kind: "", text: "" });
      i--;
    } else {
      // Addition — right has a line left doesn't
      left.push({ kind: "", text: "" });
      right.push({ kind: "added", text: bLines[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    left.push({ kind: "removed", text: aLines[i - 1] });
    right.push({ kind: "", text: "" });
    i--;
  }
  while (j > 0) {
    left.push({ kind: "", text: "" });
    right.push({ kind: "added", text: bLines[j - 1] });
    j--;
  }

  left.reverse();
  right.reverse();
  return { left, right };
}

/**
 * Quick stats for a diff — useful for header copy like
 * "v3 → v4 (12 added, 4 removed)".
 */
export function diffStats(a, b) {
  const { left, right } = diffLines(a, b);
  let added = 0;
  let removed = 0;
  for (const row of left) if (row.kind === "removed") removed++;
  for (const row of right) if (row.kind === "added") added++;
  return { added, removed };
}
