/**
 * Migration: replace V1 prompts with V2 (the rewritten system prompts from
 * the design handoff bundle).
 *
 * Affected settings rows:
 *   - system_prompt                 → V2 board interview
 *   - interview_initial_prompt      → V2 client onboarding
 *   - prompt_generation_instruction → V2 supplement generator
 *   - interview_re_prompt           — unchanged (no V2 rewrite for this one)
 *
 * Safety policy:
 *   - Only updates rows whose current value EXACTLY matches the V1 default.
 *     If the value has been customized (by a SuperAdmin or by a per-client
 *     override that has drifted), the migration prints a warning and skips.
 *   - Updates BOTH the global row (client_id IS NULL) AND per-client copies
 *     that match the V1 default. Per-client copies are created by signup.js
 *     so every existing tenant has one.
 *
 * Idempotent: re-running after success is a no-op (no rows match V1 anymore).
 *
 * Usage:
 *   railway run --service residentpulse-staging -e production node server/migrations/2026-04-30-rewrite-system-prompts.js
 *   railway run --service residentpulse        -e production node server/migrations/2026-04-30-rewrite-system-prompts.js
 *
 * Or pass DATABASE_URL inline for ad-hoc runs:
 *   DATABASE_URL='...' node server/migrations/2026-04-30-rewrite-system-prompts.js
 */

import pg from "pg";
import {
  V1_SYSTEM_PROMPT,
  V1_INTERVIEW_INITIAL,
  V1_PROMPT_GENERATION,
  LEGACY_SYSTEM_PROMPT_V0,
  LEGACY_SYSTEM_PROMPT_V05,
  LEGACY_SYSTEM_PROMPT_V09,
  V2_SYSTEM_PROMPT_V20,
  V2_SYSTEM_PROMPT,
  V2_INTERVIEW_INITIAL,
  V2_PROMPT_GENERATION,
} from "../prompts/defaults.js";

const { Pool } = pg;

/**
 * Each migration entry lists multiple `matches` strings. ANY of them count
 * as a "stale default" and are upgraded to `to`. Rows that match none of
 * the candidates are treated as customized and skipped.
 *
 * For system_prompt we include four historical defaults captured from the
 * 2026-04-30 prod audit (113 rows across versions V0/V0.5/V0.9/V1).
 */
const MIGRATIONS = [
  {
    key: "system_prompt",
    label: "Board interview",
    // Match against every known historical default. V2_SYSTEM_PROMPT_V20
    // was the value seeded by the original 2026-04-30 migration; rows
    // still holding it should be upgraded to V2.1 (current
    // V2_SYSTEM_PROMPT) which adds the explicit forbidden-first-sentence
    // openers list and the gold-standard post-NPS opener example.
    matches: [
      V1_SYSTEM_PROMPT,
      LEGACY_SYSTEM_PROMPT_V0,
      LEGACY_SYSTEM_PROMPT_V05,
      LEGACY_SYSTEM_PROMPT_V09,
      V2_SYSTEM_PROMPT_V20,
    ],
    to: V2_SYSTEM_PROMPT,
  },
  {
    key: "interview_initial_prompt",
    label: "Client onboarding interview",
    matches: [V1_INTERVIEW_INITIAL],
    to: V2_INTERVIEW_INITIAL,
  },
  {
    key: "prompt_generation_instruction",
    label: "Supplement generator",
    matches: [V1_PROMPT_GENERATION],
    to: V2_PROMPT_GENERATION,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  console.log("=== Rewrite system prompts: V1 → V2 ===\n");

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const m of MIGRATIONS) {
    console.log(`\n--- ${m.label} (${m.key}) ---`);

    // Find all rows for this key
    const rows = await pool.query(
      "SELECT id, client_id, value FROM settings WHERE key = $1 ORDER BY client_id NULLS FIRST",
      [m.key]
    );

    if (rows.rowCount === 0) {
      console.log("  No rows found for this key.");
      continue;
    }

    for (const row of rows.rows) {
      const scope = row.client_id === null ? "global" : `client_id=${row.client_id}`;

      if (row.value === m.to) {
        console.log(`  [skip] ${scope} — already V2`);
        totalSkipped++;
      } else if (m.matches.includes(row.value)) {
        await pool.query("UPDATE settings SET value = $1 WHERE id = $2", [m.to, row.id]);
        console.log(`  [updated] ${scope}`);
        totalUpdated++;
      } else {
        const preview = row.value.slice(0, 80).replace(/\n/g, " ");
        console.log(`  [skip] ${scope} — customized (matches no known default)`);
        console.log(`         preview: "${preview}..."`);
        totalSkipped++;
      }
    }
  }

  console.log(`\n=== Done. Updated: ${totalUpdated}, Skipped: ${totalSkipped} ===`);

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
