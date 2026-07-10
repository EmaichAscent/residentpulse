/* eslint-disable no-console */
/**
 * Push the V4.0 HYBRID interview prompt to the live settings row
 * (key: system_prompt_hybrid, global).
 *
 * Optional: chat.js falls back to the V4 code default when no row
 * exists, so template sessions work without ever running this. Run it
 * when you want the hybrid prompt EDITABLE in the SuperAdmin prompts
 * library (settings row + prompt_versions history).
 *
 * SAFETY: dry-run default; --apply commits; auto-saves any existing
 * value before overwriting; re-run protection with backfill recovery —
 * same discipline as push-prompt-v30/31/32.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/push-prompt-hybrid-v40.js            # dry-run
 *   node server/scripts/push-prompt-hybrid-v40.js --apply    # commit
 */

import pg from "pg";
import { V4_SYSTEM_PROMPT } from "../prompts/defaults.js";
const { Client } = pg;

const PROMPT_KEY = "system_prompt_hybrid";
const APPLY = process.argv.includes("--apply");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}

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
  console.log(`Mode: ${APPLY ? "APPLY (mutations will commit)" : "DRY-RUN (no writes)"}`);
  console.log(`Key:  ${PROMPT_KEY} (global, client_id IS NULL)`);
  console.log(`DB:   ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}\n`);

  const liveRow = await client.query(
    `SELECT value FROM settings WHERE key = $1 AND client_id IS NULL`,
    [PROMPT_KEY]
  );
  const liveText = liveRow.rows[0]?.value ?? null;

  console.log(
    liveText === null
      ? "Live value: none — chat.js is currently serving the V4 code default."
      : `Live value: ${liveText.length} chars`
  );
  console.log(`Target (V4.0): ${V4_SYSTEM_PROMPT.length} chars\n`);

  if (liveText === V4_SYSTEM_PROMPT) {
    const matching = await client.query(
      `SELECT id, version_number FROM prompt_versions WHERE prompt_key = $1 AND prompt_text = $2 ORDER BY id DESC LIMIT 1`,
      [PROMPT_KEY, liveText]
    );
    if (matching.rowCount > 0) {
      console.log("✓ Live value is ALREADY V4.0 and versioned — nothing to do.");
      await client.end();
      return;
    }
    if (!APPLY) {
      console.log("✓ DRY-RUN — would backfill a single V4.0 version row. Re-run with --apply.");
      await client.end();
      return;
    }
    const v = await nextVersionNumber();
    await client.query(
      `INSERT INTO prompt_versions (prompt_key, prompt_text, label, note, version_number, created_by)
       VALUES ($1, $2, 'V4.0', 'Backfill — live value was already V4.0.', $3, 'push-prompt-hybrid-v40.js')`,
      [PROMPT_KEY, V4_SYSTEM_PROMPT, v]
    );
    console.log("✓ COMMITTED — V4.0 version row backfilled.");
    await client.end();
    return;
  }

  if (!APPLY) {
    console.log("✓ DRY-RUN complete. Re-run with --apply to commit.");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    if (liveText !== null) {
      const oldV = await nextVersionNumber();
      await client.query(
        `INSERT INTO prompt_versions (prompt_key, prompt_text, label, note, version_number, created_by)
         VALUES ($1, $2, 'Auto-save (pre-V4.0)', 'Snapshot before push-prompt-hybrid-v40.js.', $3, 'push-prompt-hybrid-v40.js')`,
        [PROMPT_KEY, liveText, oldV]
      );
      await client.query(`UPDATE settings SET value = $1 WHERE key = $2 AND client_id IS NULL`, [
        V4_SYSTEM_PROMPT,
        PROMPT_KEY,
      ]);
      console.log(`  [APPLY] auto-saved old value as v${oldV}, updated settings`);
    } else {
      await client.query(`INSERT INTO settings (key, value, client_id) VALUES ($1, $2, NULL)`, [
        PROMPT_KEY,
        V4_SYSTEM_PROMPT,
      ]);
      console.log("  [APPLY] created the global settings row");
    }

    const newV = await nextVersionNumber();
    await client.query(
      `INSERT INTO prompt_versions (prompt_key, prompt_text, label, note, version_number, created_by)
       VALUES ($1, $2, 'V4.0', 'V4.0 hybrid interview prompt: AI = conversational depth layer, widgets = measurement. Never asks for ratings; reads bracketed widget answers; no closing section (server-driven close).', $3, 'push-prompt-hybrid-v40.js')`,
      [PROMPT_KEY, V4_SYSTEM_PROMPT, newV]
    );
    console.log(`  [APPLY] saved V4.0 as v${newV}`);

    await client.query("COMMIT");
    console.log("\n✓ COMMITTED — system_prompt_hybrid V4.0 is live.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n✗ Aborted, rolled back:", err.message);
    process.exitCode = 1;
  }
  await client.end();
}

main().catch((err) => {
  console.error("✗ Fatal:", err);
  client.end().catch(() => {});
  process.exit(1);
});
