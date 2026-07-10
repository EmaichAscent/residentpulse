/* eslint-disable no-console */
/**
 * Import Zoho Survey history into ResidentPulse (Zoho parity Phase F —
 * docs/ZOHO_PARITY_PLAN.md).
 *
 * Reads the Zoho "Survey Detail Report" xlsx export and creates:
 *   - synthetic survey_rounds per "Survey Group" (concluded)
 *   - one completed session per row (import_source='zoho',
 *     created_at = submission date)
 *   - survey_answers per non-blank rating/text cell
 *     (source='import_zoho'; absolute labels join native trend lines
 *     via value_numeric, delta labels are preserved as labeled deltas)
 *   - communities / managers / bookkeepers find-or-created from the
 *     row's names, so per-person rollups cover history too
 *
 * SAFETY:
 *   - DRY-RUN by default; --apply commits. Everything in ONE
 *     transaction — any error rolls the whole import back.
 *   - Idempotent: rows whose (client, email, submission date) session
 *     already exists with import_source='zoho' are skipped, so
 *     re-running after adding rows to the export only imports the new
 *     ones.
 *   - Refuses to touch rounds that already exist for the client
 *     unless --reuse-rounds is passed (protects clients with native
 *     rounds from collisions).
 *   - --inspect prints the header→question mapping and exits.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/import-zoho-history.js --file <xlsx> --client-id <id> [--inspect] [--reuse-rounds] [--apply]
 */

import pg from "pg";
import XLSX from "xlsx";
import {
  COLUMN_TO_CODE,
  normalizeRatingValue,
  effectiveNps,
  parseSubmissionDate,
} from "../utils/zohoImport.js";

const { Client } = pg;

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : null;
}
const FILE = arg("file");
const CLIENT_ID = Number(arg("client-id"));
const APPLY = process.argv.includes("--apply");
const INSPECT = process.argv.includes("--inspect");
const REUSE_ROUNDS = process.argv.includes("--reuse-rounds");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}
if (!FILE) {
  console.error("✗ --file <xlsx path> is required.");
  process.exit(1);
}

const wb = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false });
console.log(`File: ${FILE}`);
console.log(`Rows: ${rows.length}\n`);

if (INSPECT) {
  const headers = Object.keys(rows[0] || {});
  console.log("Header → question code mapping:");
  for (const h of headers) {
    console.log(`  ${COLUMN_TO_CODE[h] || "(meta/unmapped)"}  ${h}`);
  }
  const unmappedRatings = headers.filter(
    (h) =>
      !COLUMN_TO_CODE[h] &&
      ![
        "Account Name",
        "Email",
        "Survey-Assigned Manager",
        "Survey-Assigned Bookkeeper",
        "Office Location",
        "Submission Date",
        "Survey Group",
        "Community Type",
        "Management Type",
        "Annual Revenue",
        "NPS (Survey Information)",
        "Follow Up NPS (Survey Information)",
      ].includes(h)
  );
  if (unmappedRatings.length) {
    console.log(`\n⚠ Unmapped non-meta columns (would be dropped): ${unmappedRatings.join(", ")}`);
  } else {
    console.log("\n✓ Every non-meta column maps to a catalog question.");
  }
  process.exit(0);
}

if (!Number.isInteger(CLIENT_ID) || CLIENT_ID <= 0) {
  console.error("✗ --client-id <id> is required (the ResidentPulse client to import into).");
  process.exit(1);
}

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function one(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows[0] ?? null;
}

// Find-or-create with an in-memory cache — the export repeats the same
// ~100 communities and ~10 people across 700 rows, and every avoided
// lookup is a network round-trip over the Railway proxy.
const focCache = new Map();

async function findOrCreate(table, clientId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const cacheKey = `${table}|${trimmed}`;
  if (focCache.has(cacheKey)) return focCache.get(cacheKey);

  const existing = await one(
    `SELECT id FROM ${table} WHERE client_id = $1 AND ${table === "communities" ? "community_name" : "name"} = $2 AND is_test = FALSE`,
    [clientId, trimmed]
  );
  let id;
  if (existing) {
    id = existing.id;
  } else if (table === "communities") {
    const created = await one(
      "INSERT INTO communities (client_id, community_name, is_test) VALUES ($1, $2, FALSE) RETURNING id",
      [clientId, trimmed]
    );
    id = created.id;
  } else {
    const created = await one(
      `INSERT INTO ${table} (client_id, name, is_test) VALUES ($1, $2, FALSE) RETURNING id`,
      [clientId, trimmed]
    );
    id = created.id;
  }
  focCache.set(cacheKey, id);
  return id;
}

async function main() {
  await client.connect();
  console.log(`Mode:      ${APPLY ? "APPLY" : "DRY-RUN (no writes)"}`);
  console.log(`Client id: ${CLIENT_ID}`);
  console.log(`DB:        ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}\n`);

  const clientRow = await one("SELECT id, company_name FROM clients WHERE id = $1", [CLIENT_ID]);
  if (!clientRow) {
    console.error(`✗ No client with id ${CLIENT_ID}.`);
    process.exit(1);
  }
  console.log(`Importing into: ${clientRow.company_name}\n`);

  // Question catalog lookup (code → question row)
  const catalog = new Map();
  const qRes = await client.query("SELECT * FROM survey_questions");
  for (const q of qRes.rows) catalog.set(q.code, q);
  const missingCodes = [...new Set(Object.values(COLUMN_TO_CODE))].filter((c) => !catalog.has(c));
  if (missingCodes.length) {
    console.error(
      `✗ Catalog is missing codes: ${missingCodes.join(", ")}. Run seed-survey-catalog.js --apply first.`
    );
    process.exit(1);
  }

  // Round safety: refuse pre-existing round numbers unless --reuse-rounds
  const groups = [...new Set(rows.map((r) => Number(r["Survey Group"])).filter(Boolean))].sort(
    (a, b) => a - b
  );
  const existingRounds = await client.query(
    "SELECT round_number FROM survey_rounds WHERE client_id = $1 AND is_test = FALSE AND round_number = ANY($2)",
    [CLIENT_ID, groups]
  );
  if (existingRounds.rowCount > 0 && !REUSE_ROUNDS) {
    console.error(
      `✗ Round number(s) ${existingRounds.rows.map((r) => r.round_number).join(", ")} already exist for this client. ` +
        `Pass --reuse-rounds to attach imported sessions to them, or import into a fresh client.`
    );
    process.exit(1);
  }

  await client.query("BEGIN");
  try {
    // Synthetic rounds per Survey Group, dated by earliest submission.
    const roundIdByGroup = new Map();
    for (const g of groups) {
      const existing = await one(
        "SELECT id FROM survey_rounds WHERE client_id = $1 AND round_number = $2 AND is_test = FALSE",
        [CLIENT_ID, g]
      );
      if (existing) {
        roundIdByGroup.set(g, existing.id);
        continue;
      }
      const dates = rows
        .filter((r) => Number(r["Survey Group"]) === g)
        .map((r) => parseSubmissionDate(r["Submission Date"]))
        .filter(Boolean)
        .sort();
      const scheduled = dates[0] || "2024-01-01";
      const concluded = dates[dates.length - 1] || scheduled;
      console.log(`  + round ${g} (${scheduled} → ${concluded})`);
      if (APPLY) {
        const created = await one(
          `INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date, launched_at, concluded_at, is_test)
           VALUES ($1, $2, 'concluded', $3::date, $4::timestamp, $5::timestamp, FALSE) RETURNING id`,
          [CLIENT_ID, g, scheduled, scheduled, concluded]
        );
        roundIdByGroup.set(g, created.id);
      }
    }

    let created = 0;
    let skipped = 0;
    let answers = 0;
    const unknownLabels = new Set();

    // Idempotency set loaded ONCE — one round-trip instead of one per row.
    const alreadyImported = new Set();
    const existingRes = await client.query(
      `SELECT LOWER(email) as email, TO_CHAR(created_at, 'YYYY-MM-DD') as d
       FROM sessions WHERE client_id = $1 AND import_source = 'zoho'`,
      [CLIENT_ID]
    );
    for (const r of existingRes.rows) alreadyImported.add(`${r.email}|${r.d}`);

    for (const row of rows) {
      const email = (row["Email"] || "").trim().toLowerCase();
      const date = parseSubmissionDate(row["Submission Date"]);
      if (!email || !date) {
        skipped++;
        continue;
      }

      if (alreadyImported.has(`${email}|${date}`)) {
        skipped++;
        continue;
      }

      created++;
      if (!APPLY) continue;

      const communityId = await findOrCreate("communities", CLIENT_ID, row["Account Name"]);
      const managerId = await findOrCreate("managers", CLIENT_ID, row["Survey-Assigned Manager"]);
      const bookkeeperId = await findOrCreate(
        "bookkeepers",
        CLIENT_ID,
        row["Survey-Assigned Bookkeeper"]
      );
      const nps = effectiveNps(row);
      const roundId = roundIdByGroup.get(Number(row["Survey Group"])) ?? null;

      const session = await one(
        `INSERT INTO sessions (email, client_id, round_id, community_id, community_name, nps_score, completed, is_test, import_source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, 'zoho', $7) RETURNING id`,
        [
          email,
          CLIENT_ID,
          roundId,
          communityId,
          (row["Account Name"] || "").trim() || null,
          nps,
          `${date}T12:00:00Z`,
        ]
      );

      // Answers batch into ONE multi-row insert per session — ~45
      // single inserts per row over the proxy is what made the first
      // run crawl (and hold locks long enough to block a deploy).
      const answerRows = [];
      const queueAnswer = (question, fields) => {
        answerRows.push([
          session.id,
          question.id,
          roundId,
          CLIENT_ID,
          question.entity_target,
          question.entity_target === "manager"
            ? managerId
            : question.entity_target === "bookkeeper"
              ? bookkeeperId
              : question.entity_target === "community"
                ? communityId
                : null,
          fields.numeric ?? null,
          fields.text ?? null,
          fields.json ? JSON.stringify(fields.json) : null,
          `${date}T12:00:00Z`,
        ]);
      };

      if (nps !== null) {
        queueAnswer(catalog.get("Q001"), { numeric: nps });
        answers++;
      }

      for (const [column, code] of Object.entries(COLUMN_TO_CODE)) {
        const question = catalog.get(code);
        const raw = row[column];
        if (question.answer_format === "open_text") {
          const text = (raw ?? "").toString().trim();
          if (!text) continue;
          queueAnswer(question, { text });
          answers++;
          continue;
        }
        const norm = normalizeRatingValue(raw);
        if (!norm) continue;
        if (norm.kind === "absolute") {
          queueAnswer(question, {
            numeric: norm.numeric,
            json: { zoho_label: norm.label, zoho_kind: "absolute" },
          });
        } else if (norm.kind === "delta") {
          queueAnswer(question, {
            json: { zoho_label: norm.label, zoho_kind: "delta", delta: norm.delta },
          });
        } else {
          unknownLabels.add(norm.label);
          queueAnswer(question, {
            text: norm.label,
            json: { zoho_label: norm.label, zoho_kind: "unknown" },
          });
        }
        answers++;
      }

      if (answerRows.length > 0) {
        const placeholders = answerRows
          .map((_, i) => {
            const b = i * 10;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, 'answered', $${b + 7}, $${b + 8}, $${b + 9}, 'import_zoho', FALSE, $${b + 10})`;
          })
          .join(", ");
        await client.query(
          `INSERT INTO survey_answers
             (session_id, question_id, round_id, client_id, entity_type, entity_id,
              status, value_numeric, value_text, value_json, source, is_test, answered_at)
           VALUES ${placeholders}`,
          answerRows.flat()
        );
      }
    }

    console.log(
      `\nSessions: ${created} to create, ${skipped} skipped (already imported / no email or date)`
    );
    if (APPLY) console.log(`Answers:  ${answers} written`);
    if (unknownLabels.size) {
      console.log(
        `⚠ Unrecognized rating labels imported as text: ${[...unknownLabels].join(", ")}`
      );
    }

    if (APPLY) {
      await client.query("COMMIT");
      console.log("\n✓ COMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n✓ DRY-RUN complete — no writes. Re-run with --apply to commit.");
    }
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
