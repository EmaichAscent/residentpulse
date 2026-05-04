/* eslint-disable no-console */
/**
 * Read-only inspector for the prompt_versions table + the live
 * settings.value the SuperAdmin Prompts library reads from.
 *
 * Use when you've pushed a new prompt version via push-prompt-v*.js
 * but the SuperAdmin UI doesn't reflect it. This script prints:
 *
 *   • Which DB you're connected to (host + db name, redacted creds)
 *   • The live settings.value for system_prompt — its length and a
 *     short fingerprint of the closing block
 *   • All prompt_versions rows for system_prompt — id, version_number,
 *     label, length, created_by, created_at
 *   • Whether the live settings.value byte-matches any version row's
 *     prompt_text (which is what drives the page header "Version N"
 *     vs "Live (untracked version)")
 *   • A V2.7-specific check: does the live value contain the V2.7
 *     fingerprint ("Pivot structure — generate fresh")
 *
 * Read-only. No writes. Safe to run anytime.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/inspect-prompt-versions.js
 */

import pg from "pg";
import { V2_SYSTEM_PROMPT } from "../prompts/defaults.js";
const { Client } = pg;

const PROMPT_KEY = "system_prompt";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}

function fingerprint(text, marker) {
  const idx = text.indexOf(marker);
  if (idx === -1) return `MISSING: "${marker}"`;
  return `at byte ${idx}, snippet: "${text.slice(idx, idx + 80).replace(/\n/g, " ")}…"`;
}

function shortHash(text) {
  // Cheap deterministic hash for at-a-glance equality checks
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h * 31 + text.charCodeAt(i)) >>> 0) % 0xffffffff;
  }
  return h.toString(16).padStart(8, "0");
}

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();

  const dbInfo = await client.query("SELECT current_database() AS db, inet_server_addr() AS host");
  console.log(`Connected to:`);
  console.log(`  url:  ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}`);
  console.log(`  db:   ${dbInfo.rows[0].db}`);
  console.log(`  host: ${dbInfo.rows[0].host || "(via proxy)"}`);

  console.log(`\n── Live settings.value (key=${PROMPT_KEY}, client_id IS NULL) ──`);
  const liveRow = await client.query(
    `SELECT value FROM settings WHERE key = $1 AND client_id IS NULL`,
    [PROMPT_KEY]
  );
  const liveText = liveRow.rows[0]?.value || null;
  if (!liveText) {
    console.log(`  ✗ NO ROW. The settings table has no global system_prompt entry.`);
  } else {
    console.log(`  length:      ${liveText.length} chars, ${liveText.split("\n").length} lines`);
    console.log(`  hash:        ${shortHash(liveText)}`);
    console.log(`  V2.7 marker: ${fingerprint(liveText, "Pivot structure — generate fresh")}`);
    console.log(`  V2.6 marker: ${fingerprint(liveText, "playback before close")}`);
  }

  console.log(`\n── prompt_versions rows for ${PROMPT_KEY} (newest first) ──`);
  const versions = await client.query(
    `SELECT id, version_number, label, note, created_by, created_at,
            length(prompt_text) AS text_len
     FROM prompt_versions
     WHERE prompt_key = $1
     ORDER BY id DESC
     LIMIT 20`,
    [PROMPT_KEY]
  );
  if (versions.rowCount === 0) {
    console.log(`  ✗ NO ROWS. prompt_versions has no entries for ${PROMPT_KEY}.`);
  } else {
    console.log(`  Found ${versions.rowCount} rows (showing up to 20):`);
    for (const r of versions.rows) {
      const created = new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ");
      const v = r.version_number != null ? `v${String(r.version_number).padStart(2)}` : "  v?";
      const label = (r.label || "(no label)").padEnd(34).slice(0, 34);
      console.log(
        `  id=${String(r.id).padStart(4)} ${v}  ${label}  ${String(r.text_len).padStart(6)} chars  ${created}  by ${r.created_by || "(unknown)"}`
      );
    }
  }

  console.log(`\n── Match check (drives the page header "Version N" vs "Live (untracked)") ──`);
  if (!liveText) {
    console.log(`  Skipped — no live value.`);
  } else {
    const match = await client.query(
      `SELECT id, version_number, label
       FROM prompt_versions
       WHERE prompt_key = $1 AND prompt_text = $2
       ORDER BY created_at DESC LIMIT 1`,
      [PROMPT_KEY, liveText]
    );
    if (match.rowCount === 0) {
      console.log(
        `  ✗ NO MATCH — live settings.value does NOT byte-match any prompt_versions row.`
      );
      console.log(`     This is why the page header shows "Live (untracked version)".`);
      console.log(`     If you JUST pushed V2.7, possible causes:`);
      console.log(`       • Whitespace drift between settings.value and the inserted row`);
      console.log(`       • Two different DBs — script wrote here, app reads elsewhere`);
      console.log(`       • The push script crashed before the V2.7 INSERT`);
    } else {
      const r = match.rows[0];
      console.log(
        `  ✓ MATCH — settings.value = prompt_versions.id=${r.id} (v${r.version_number} "${r.label}")`
      );
      console.log(`     The page header should show "Version ${r.version_number} · ${r.label}".`);
      console.log(`     If the UI still shows "Live (untracked)", the page is reading from a`);
      console.log(`     different DB than this one.`);
    }
  }

  console.log(`\n── Code's V2_SYSTEM_PROMPT vs live ──`);
  console.log(`  Local code V2_SYSTEM_PROMPT length: ${V2_SYSTEM_PROMPT.length}`);
  console.log(`  Local code V2_SYSTEM_PROMPT hash:   ${shortHash(V2_SYSTEM_PROMPT)}`);
  if (liveText) {
    if (liveText === V2_SYSTEM_PROMPT) {
      console.log(`  ✓ Live value byte-matches the local V2_SYSTEM_PROMPT (V2.7 in code).`);
    } else {
      console.log(`  ✗ Live value does NOT byte-match local V2_SYSTEM_PROMPT.`);
      console.log(`     Live hash:  ${shortHash(liveText)}`);
      console.log(`     Local hash: ${shortHash(V2_SYSTEM_PROMPT)}`);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Fatal:", err);
  client.end().catch(() => {});
  process.exit(1);
});
