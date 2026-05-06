/* eslint-disable no-console */
/**
 * Push the V3.2 board interview prompt to the live `settings` row.
 *
 * V3.2 is a surgical patch off V3.1 (see prompts/defaults.js comment
 * block above the V3.2 derivation). It REPLACES the V3.1 drill section
 * (keyword-list-based, ~1.5k chars) with a simpler principle-based
 * version (~1.0k chars). Net V3.2 is SHORTER than V3.1.
 *
 * Why: V3.1 production transcript showed the model missing "come apart"
 * because it wasn't in the V3.1 keyword list. The model treated the
 * list as exhaustive instead of illustrative. V3.2 strips the list and
 * uses one principle: "When the resident names a specific event,
 * behavior, or named person — your next 2–4 follow-ups are about THAT
 * specific thing. Don't broaden to abstract themes."
 *
 * What this script does (only on the global `system_prompt` setting
 * where client_id IS NULL):
 *   1. Reads the current settings.value
 *   2. Auto-saves the current value as a new prompt_versions row
 *      labeled "Auto-save (pre-V3.2)" — your rollback point
 *   3. Updates settings.value to V2_SYSTEM_PROMPT (= V3.2)
 *   4. Inserts another prompt_versions row labeled "V3.2"
 *
 * SAFETY:
 *   • DRY-RUN by default. Mutations require --apply.
 *   • Refuses to start unless DATABASE_URL is set.
 *   • Re-run protection: if live is ALREADY V3.2 exits cleanly, with
 *     the same backfill recovery path as v30/v31.
 *   • All writes wrapped in a single transaction.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/push-prompt-v32.js              # dry-run
 *   node server/scripts/push-prompt-v32.js --apply      # commit
 */

import pg from "pg";
import { V2_SYSTEM_PROMPT, V3_1_SYSTEM_PROMPT, V3_0_SYSTEM_PROMPT } from "../prompts/defaults.js";
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
  // V3.2's signature: the new "Drill on specifics" header. V3.1 had
  // "Drill before pivoting". V3.0 had no drill section.
  const v32 = text.indexOf("Drill on specifics");
  if (v32 >= 0) return 'V3.2 ("Drill on specifics" header present)';
  const v31 = text.indexOf("Drill before pivoting");
  if (v31 >= 0) return 'V3.1 ("Drill before pivoting" header present)';
  return "V3.0 or earlier (no drill section)";
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
  console.log(`  fingerprint: ${previewFingerprint(liveText)}`);

  console.log(`\nTarget value (V3.2):`);
  console.log(
    `  length: ${V2_SYSTEM_PROMPT.length} chars, ${V2_SYSTEM_PROMPT.split("\n").length} lines`
  );
  console.log(`  fingerprint: ${previewFingerprint(V2_SYSTEM_PROMPT)}`);

  // Re-run protection — also handles the "live IS V3.2 but no version
  // row records it" recovery path (same pattern as v30/v31).
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
        `\n✓ Live value is ALREADY V3.2 (matches prompt_versions.id=${r.id} v${r.version_number} "${r.label}") — nothing to do.`
      );
      await client.end();
      return;
    }

    console.log(`\n⚠ Live value IS V3.2 but no prompt_versions row records it.`);
    console.log(`  Recovery mode: will insert a V3.2 row to make the SuperAdmin UI`);
    console.log(`  recognize the live value. No settings UPDATE, no auto-save.`);

    if (!APPLY) {
      console.log(`\n✓ DRY-RUN complete — would insert a single V3.2 row. Re-run with --apply.`);
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
          "V3.2",
          "Backfill — settings.value was already V3.2 but no version row recorded it. Inserted by push-prompt-v32.js recovery path.",
          versionNumber,
          "push-prompt-v32.js",
        ]
      );
      console.log(
        `  [APPLY] inserted v${versionNumber} "V3.2" to record the live value (${V2_SYSTEM_PROMPT.length} chars)`
      );
      await client.query("COMMIT");
      console.log(`\n✓ COMMITTED — V3.2 row backfilled. Refresh the SuperAdmin Prompts page.`);
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
  let autoSaveLabel = "Auto-save (pre-V3.2)";
  let autoSaveNote = "Live value snapshot before push-prompt-v32.js applied V3.2.";
  if (bytesEqual(liveText, V3_1_SYSTEM_PROMPT)) {
    autoSaveLabel = "V3.1 (pre-V3.2 snapshot)";
    autoSaveNote = "Live value matched the frozen V3.1 default exactly when V3.2 was pushed.";
    console.log(
      `\nLive value matches V3.1 default exactly — auto-save labeled "${autoSaveLabel}".`
    );
  } else if (bytesEqual(liveText, V3_0_SYSTEM_PROMPT)) {
    autoSaveLabel = "V3.0 (pre-V3.2 snapshot, V3.1 was skipped)";
    autoSaveNote =
      "Live value matched V3.0 default — V3.1 was apparently never pushed, V3.2 jumps straight from V3.0.";
    console.log(`\nLive value matches V3.0 default — V3.1 was skipped.`);
  } else {
    console.log(
      `\nLive value does NOT match V3.1 or V3.0 default exactly — somebody edited it via the SuperAdmin UI. ` +
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
      [PROMPT_KEY, liveText, autoSaveLabel, autoSaveNote, oldVersionNumber, "push-prompt-v32.js"]
    );
    console.log(`  [APPLY] auto-saved OLD value as v${oldVersionNumber} ("${autoSaveLabel}")`);

    // 2. Update settings.value to V3.2
    await client.query(`UPDATE settings SET value = $1 WHERE key = $2 AND client_id IS NULL`, [
      V2_SYSTEM_PROMPT,
      PROMPT_KEY,
    ]);
    console.log(
      `  [APPLY] updated settings.${PROMPT_KEY} to V3.2 (${V2_SYSTEM_PROMPT.length} chars)`
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
        "V3.2",
        "V3.2: simpler principle-based drill section. Replaces V3.1's keyword-list trigger ('meltdown', 'blew up', etc.) with one principle: 'When the resident names a specific event, behavior, or named person — your next 2-4 follow-ups are about THAT specific thing. Don't broaden to abstract themes.' Plus an explicit anti-pattern: 'Re-broadening to abstract themes IS a pivot — do NOT pivot during a drill.' Net SHORTER than V3.1. Pushed via push-prompt-v32.js.",
        newVersionNumber,
        "push-prompt-v32.js",
      ]
    );
    console.log(`  [APPLY] saved NEW value as v${newVersionNumber} ("V3.2")`);

    await client.query("COMMIT");
    console.log(`\n✓ COMMITTED — V3.2 is now live.`);
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
