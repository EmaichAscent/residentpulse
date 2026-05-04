/* eslint-disable no-console */
/**
 * Push the V2.8 board interview prompt to the live `settings` row that
 * powers every board-member chat in production. This is the
 * "make-it-live" step after the V2.8 prompt-text changes ship in code.
 *
 * What it does (only on the global `system_prompt` setting where
 * client_id IS NULL):
 *   1. Reads the current settings.value
 *   2. Auto-saves the current value as a new prompt_versions row
 *      labeled "Auto-save (pre-V2.8)" so the operator can roll back
 *   3. Updates settings.value to V2_SYSTEM_PROMPT (V2.8)
 *   4. Inserts another prompt_versions row labeled "V2.8" so the
 *      Prompts library shows the new live version
 *
 * SAFETY:
 *   • DRY-RUN by default. Mutations require an explicit --apply flag.
 *   • Refuses to start unless DATABASE_URL is set (no hard-coded
 *     production URL).
 *   • If the live value is ALREADY V2.8 (re-run protection), exits
 *     cleanly without writing.
 *   • All writes wrapped in a single transaction.
 *
 * Usage:
 *   # Dry-run against prod (prints diff, mutates nothing):
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/push-prompt-v28.js
 *
 *   # Apply:
 *   node server/scripts/push-prompt-v28.js --apply
 */

import pg from "pg";
import { V2_SYSTEM_PROMPT, V2_SYSTEM_PROMPT_V27 } from "../prompts/defaults.js";
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
  // Compute a small line-count summary; we don't need a full LCS for a
  // pre-flight check.
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = newLines.filter((l) => !oldSet.has(l)).length;
  const removed = oldLines.filter((l) => !newSet.has(l)).length;
  return { added, removed, oldLines: oldLines.length, newLines: newLines.length };
}

function previewFingerprint(text) {
  // Show enough of the closing-block change so the operator can eyeball
  // that the substitution actually fired.
  const idx = text.indexOf("Closing the chat");
  if (idx === -1) return "(no Closing block found)";
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

  // Read current live value
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
  console.log(`  closing snippet: ${previewFingerprint(liveText)}`);

  console.log(`\nTarget value (V2.8):`);
  console.log(
    `  length: ${V2_SYSTEM_PROMPT.length} chars, ${V2_SYSTEM_PROMPT.split("\n").length} lines`
  );
  console.log(`  closing snippet: ${previewFingerprint(V2_SYSTEM_PROMPT)}`);

  // Re-run protection — but check whether a prompt_versions row
  // ACTUALLY records the live value as V2.8. If settings.value matches
  // V2.8 but no version row exists, the SuperAdmin Prompts library
  // header reads "Live (untracked version)" and the Recent Versions
  // panel doesn't surface V2.8 as Current. Recover by inserting the
  // missing version row (no auto-save needed — settings is already V2.8).
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
        `\n✓ Live value is ALREADY V2.8 (matches prompt_versions.id=${r.id} v${r.version_number} "${r.label}") — nothing to do.`
      );
      await client.end();
      return;
    }

    // Live value matches V2.8 but no prompt_versions row records it.
    // Possible causes:
    //   • A previous --apply created the row but it was later deleted
    //     via the SuperAdmin UI's delete-version button
    //   • settings.value was edited via direct SQL (not through the
    //     SuperAdmin UI's auto-save flow) — leaves no version row
    //   • A previous push-prompt-v28.js --apply crashed mid-transaction
    //     before the V2.8 INSERT (rollback should have prevented this,
    //     but sometimes COMMIT/ROLLBACK timing is racy)
    //
    // Recovery: insert just the V2.8 row, no settings UPDATE, no
    // auto-save (settings is already V2.8).
    console.log(`\n⚠ Live value IS V2.8 but no prompt_versions row records it.`);
    console.log(`  Recovery mode: will insert a V2.8 row to make the SuperAdmin UI`);
    console.log(`  recognize the live value. No settings UPDATE, no auto-save.`);

    if (!APPLY) {
      console.log(`\n✓ DRY-RUN complete — would insert a single V2.8 row. Re-run with --apply.`);
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
          "V2.8",
          "Backfill — settings.value was already V2.8 but no version row recorded it. Inserted by push-prompt-v28.js recovery path.",
          versionNumber,
          "push-prompt-v28.js",
        ]
      );
      console.log(
        `  [APPLY] inserted v${versionNumber} "V2.8" to record the live value (${V2_SYSTEM_PROMPT.length} chars)`
      );
      await client.query("COMMIT");
      console.log(`\n✓ COMMITTED — V2.8 row backfilled. Refresh the SuperAdmin Prompts page.`);
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
  let autoSaveLabel = "Auto-save (pre-V2.8)";
  let autoSaveNote = "Live value snapshot before push-prompt-v28.js applied V2.8.";
  if (bytesEqual(liveText, V2_SYSTEM_PROMPT_V27)) {
    autoSaveLabel = "V2.7 (pre-V2.8 snapshot)";
    autoSaveNote = "Live value matched the frozen V2.7 default exactly when V2.8 was pushed.";
    console.log(
      `\nLive value matches V2.7 default exactly — auto-save labeled "${autoSaveLabel}".`
    );
  } else {
    console.log(
      `\nLive value does NOT match V2.7 default exactly — somebody edited it via the SuperAdmin UI. ` +
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
      [PROMPT_KEY, liveText, autoSaveLabel, autoSaveNote, oldVersionNumber, "push-prompt-v28.js"]
    );
    console.log(`  [APPLY] auto-saved OLD value as v${oldVersionNumber} ("${autoSaveLabel}")`);

    // 2. Update settings.value to V2.8
    await client.query(`UPDATE settings SET value = $1 WHERE key = $2 AND client_id IS NULL`, [
      V2_SYSTEM_PROMPT,
      PROMPT_KEY,
    ]);
    console.log(
      `  [APPLY] updated settings.${PROMPT_KEY} to V2.8 (${V2_SYSTEM_PROMPT.length} chars)`
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
        "V2.8",
        "V2.8: closed-topic lockout + terminal forward-looking probe + closing 2-sentence exemption + expanded validation/sycophancy bans (drilled-into-ask + re-opened-closed-topic). Pushed via push-prompt-v28.js.",
        newVersionNumber,
        "push-prompt-v28.js",
      ]
    );
    console.log(`  [APPLY] saved NEW value as v${newVersionNumber} ("V2.8")`);

    await client.query("COMMIT");
    console.log(`\n✓ COMMITTED — V2.8 is now live.`);
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
