/* eslint-disable no-console */
/**
 * Push the V3.1 board interview prompt to the live `settings` row.
 *
 * V3.1 is a surgical patch off V3.0 (see prompts/defaults.js comment
 * block above the V3.1 derivation). It adds:
 *   • "Drill before pivoting" section with explicit triggers and the
 *     four useful drill questions, inserted before Coverage areas.
 *   • Updated "2 follow-ups MAX" hard rule that acknowledges the new
 *     drill override (3–4 follow-ups for high-signal disclosures).
 *   • Renamed "Critical signals" → "Capture-only signals" to
 *     disambiguate from drill triggers.
 *
 * What this script does (only on the global `system_prompt` setting
 * where client_id IS NULL):
 *   1. Reads the current settings.value
 *   2. Auto-saves the current value as a new prompt_versions row
 *      labeled "Auto-save (pre-V3.1)" so the operator can roll back
 *   3. Updates settings.value to V2_SYSTEM_PROMPT (= V3.1)
 *   4. Inserts another prompt_versions row labeled "V3.1" so the
 *      Prompts library shows the new live version
 *
 * SAFETY:
 *   • DRY-RUN by default. Mutations require --apply.
 *   • Refuses to start unless DATABASE_URL is set.
 *   • If live is ALREADY V3.1, exits cleanly. If live matches V3.1
 *     but no prompt_versions row records it, runs the same backfill
 *     recovery path as v30.
 *   • All writes wrapped in a single transaction.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/push-prompt-v31.js              # dry-run
 *   node server/scripts/push-prompt-v31.js --apply      # commit
 */

import pg from "pg";
import { V2_SYSTEM_PROMPT, V3_0_SYSTEM_PROMPT } from "../prompts/defaults.js";
const { Client } = pg;

const PROMPT_KEY = "system_prompt";
const APPLY = process.argv.includes("--apply");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────

function bytesEqual(a, b) {
  return a === b;
}

function lineDiffSummary(oldText, newText) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = newLines.filter((l) => !oldSet.has(l)).length;
  const removed = oldLines.filter((l) => !newSet.has(l)).length;
  return { added, removed, oldLines: oldLines.length, newLines: newLines.length };
}

function previewFingerprint(text) {
  // V3.1's signature: the new "Drill before pivoting" header. If it's
  // present, the live value is V3.1; if absent, it's pre-V3.1.
  const idx = text.indexOf("Drill before pivoting");
  if (idx === -1) return "(no Drill section — pre-V3.1)";
  return text.slice(idx, idx + 200).replace(/\n/g, "  ");
}

// ── Main ─────────────────────────────────────────────────────────────

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function nextVersionNumber() {
  const row = await client.query(
    `SELECT MAX(version_number) AS max_v FROM prompt_versions WHERE prompt_key = $1`,
    [PROMPT_KEY]
  );
  return (row.rows[0]?.max_v ?? 0) + 1;
}

async function main() {
  await client.connect();

  console.log(`Mode:    ${APPLY ? "APPLY (mutations will commit)" : "DRY-RUN (no writes)"}`);
  console.log(`Key:     ${PROMPT_KEY} (global, client_id IS NULL)`);
  console.log(`DB:      ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}`);

  const liveRow = await client.query(
    `SELECT value FROM settings WHERE key = $1 AND client_id IS NULL`,
    [PROMPT_KEY]
  );
  const liveText = liveRow.rows[0]?.value || "";

  if (!liveText) {
    throw new Error(
      `No global settings row for key=${PROMPT_KEY}. Refusing to insert from scratch — verify the row exists first.`
    );
  }

  console.log(`\nLive value:`);
  console.log(`  length: ${liveText.length} chars, ${liveText.split("\n").length} lines`);
  console.log(`  drill snippet: ${previewFingerprint(liveText)}`);

  console.log(`\nTarget value (V3.1):`);
  console.log(
    `  length: ${V2_SYSTEM_PROMPT.length} chars, ${V2_SYSTEM_PROMPT.split("\n").length} lines`
  );
  console.log(`  drill snippet: ${previewFingerprint(V2_SYSTEM_PROMPT)}`);

  // Re-run protection — also handles the "live IS V3.1 but no version
  // row records it" recovery path (same logic as push-prompt-v30.js).
  if (bytesEqual(liveText, V2_SYSTEM_PROMPT)) {
    const matchingRow = await client.query(
      `SELECT id, version_number, label
       FROM prompt_versions
       WHERE prompt_key = $1 AND prompt_text = $2
       ORDER BY id DESC LIMIT 1`,
      [PROMPT_KEY, liveText]
    );

    if (matchingRow.rowCount > 0) {
      const r = matchingRow.rows[0];
      console.log(
        `\n✓ Live value is ALREADY V3.1 (matches prompt_versions.id=${r.id} v${r.version_number} "${r.label}") — nothing to do.`
      );
      await client.end();
      return;
    }

    console.log(`\n⚠ Live value IS V3.1 but no prompt_versions row records it.`);
    console.log(`  Recovery mode: will insert a V3.1 row to make the SuperAdmin UI`);
    console.log(`  recognize the live value. No settings UPDATE, no auto-save.`);

    if (!APPLY) {
      console.log(`\n✓ DRY-RUN complete — would insert a single V3.1 row. Re-run with --apply.`);
      await client.end();
      return;
    }

    await client.query("BEGIN");
    try {
      const versionNumber = await nextVersionNumber();
      await client.query(
        `INSERT INTO prompt_versions
           (prompt_key, prompt_text, blocks_jsonb, label, note, version_number, created_by)
         VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
        [
          PROMPT_KEY,
          V2_SYSTEM_PROMPT,
          "V3.1",
          "Backfill — settings.value was already V3.1 but no version row recorded it. Inserted by push-prompt-v31.js recovery path.",
          versionNumber,
          "push-prompt-v31.js",
        ]
      );
      console.log(
        `  [APPLY] inserted v${versionNumber} "V3.1" to record the live value (${V2_SYSTEM_PROMPT.length} chars)`
      );
      await client.query("COMMIT");
      console.log(`\n✓ COMMITTED — V3.1 row backfilled. Refresh the SuperAdmin Prompts page.`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("\n✗ Recovery failed, rolled back. Cause:");
      console.error(err);
      process.exitCode = 1;
    }
    await client.end();
    return;
  }

  // Diff summary
  const diff = lineDiffSummary(liveText, V2_SYSTEM_PROMPT);
  console.log(
    `\nDiff: ${diff.added} lines added, ${diff.removed} lines removed (${diff.oldLines} → ${diff.newLines} total).`
  );

  // Identify what we'll auto-save the OLD value as.
  let autoSaveLabel = "Auto-save (pre-V3.1)";
  let autoSaveNote = "Live value snapshot before push-prompt-v31.js applied V3.1.";
  if (bytesEqual(liveText, V3_0_SYSTEM_PROMPT)) {
    autoSaveLabel = "V3.0 (pre-V3.1 snapshot)";
    autoSaveNote = "Live value matched the frozen V3.0 default exactly when V3.1 was pushed.";
    console.log(
      `\nLive value matches V3.0 default exactly — auto-save labeled "${autoSaveLabel}".`
    );
  } else {
    console.log(
      `\nLive value does NOT match V3.0 default exactly — somebody edited it via the SuperAdmin UI. ` +
        `Will still proceed; auto-save preserves the customized value as a rollback point.`
    );
  }

  if (!APPLY) {
    console.log(`\n✓ DRY-RUN complete — no changes applied. Re-run with --apply to commit.`);
    await client.end();
    return;
  }

  // ── APPLY ──
  await client.query("BEGIN");
  try {
    // 1. Auto-save the OLD value
    const oldVersionNumber = await nextVersionNumber();
    await client.query(
      `INSERT INTO prompt_versions
         (prompt_key, prompt_text, blocks_jsonb, label, note, version_number, created_by)
       VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
      [PROMPT_KEY, liveText, autoSaveLabel, autoSaveNote, oldVersionNumber, "push-prompt-v31.js"]
    );
    console.log(`  [APPLY] auto-saved OLD value as v${oldVersionNumber} ("${autoSaveLabel}")`);

    // 2. Update settings.value to V3.1
    await client.query(`UPDATE settings SET value = $1 WHERE key = $2 AND client_id IS NULL`, [
      V2_SYSTEM_PROMPT,
      PROMPT_KEY,
    ]);
    console.log(
      `  [APPLY] updated settings.${PROMPT_KEY} to V3.1 (${V2_SYSTEM_PROMPT.length} chars)`
    );

    // 3. Save NEW value as the next version
    const newVersionNumber = await nextVersionNumber();
    await client.query(
      `INSERT INTO prompt_versions
         (prompt_key, prompt_text, blocks_jsonb, label, note, version_number, created_by)
       VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
      [
        PROMPT_KEY,
        V2_SYSTEM_PROMPT,
        "V3.1",
        "V3.1: drill-before-pivoting patch off V3.0. Adds 'Drill before pivoting' section with explicit behavioral-incident triggers (meltdown, blew up, considering switching, etc.), updates the '2 follow-ups MAX' hard rule to allow 3–4 follow-ups for high-signal disclosures, and renames 'Critical signals' to 'Capture-only signals' for disambiguation. Pushed via push-prompt-v31.js.",
        newVersionNumber,
        "push-prompt-v31.js",
      ]
    );
    console.log(`  [APPLY] saved NEW value as v${newVersionNumber} ("V3.1")`);

    await client.query("COMMIT");
    console.log(`\n✓ COMMITTED — V3.1 is now live.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n✗ Aborted, rolled back. Cause:");
    console.error(err);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Fatal:", err);
  client.end().catch(() => {});
  process.exit(1);
});
