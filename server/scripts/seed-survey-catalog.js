/* eslint-disable no-console */
/**
 * Seed the survey question catalog, trigger library, and Default
 * template (Zoho parity Phase C1 — docs/ZOHO_PARITY_PLAN.md).
 *
 * Question set mirrors the dimensions Cadden's Zoho survey collects
 * (Cadden Survey Detail Report, July 2026 export) restructured for
 * absolute-value capture:
 *   - Q001            NPS
 *   - C01–C12         Company service + open-text
 *   - Y01–Y08         Community management effectiveness
 *   - M01–M15         Manager performance + open-text
 *   - F01–F10         Financial / bookkeeper + open-text
 *
 * The Default template (global, is_default) is the self-signup
 * baseline: 4 required + 3 contextual questions, published as v1 so
 * new clients work out of the box.
 *
 * SAFETY:
 *   - DRY-RUN by default; --apply commits.
 *   - Idempotent: questions keyed on code, triggers on label, the
 *     Default template on is_default. Re-runs update nothing and
 *     insert only what's missing.
 *   - Single transaction.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   node server/scripts/seed-survey-catalog.js            # dry-run
 *   node server/scripts/seed-survey-catalog.js --apply    # commit
 */

import pg from "pg";
const { Client } = pg;

const APPLY = process.argv.includes("--apply");
// Publishing the global default is the switch that flips every
// template-less client to the hybrid flow — opt-in, never implicit.
const PUBLISH_DEFAULT = process.argv.includes("--publish-default");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}

const LIKERT = { low: "Very poor", high: "Excellent" };

// code, label, category, entity, format, format_config
const QUESTIONS = [
  ["Q001", "NPS — likelihood to recommend", "NPS", "company", "nps", null],

  // Company service (Zoho "Rate the company" block)
  ["C01", "Value for services", "Company service", "company", "likert5", LIKERT],
  ["C02", "Friendliness of staff", "Company service", "company", "likert5", LIKERT],
  ["C03", "Overall communication", "Company service", "company", "likert5", LIKERT],
  ["C04", "Response time", "Company service", "company", "likert5", LIKERT],
  ["C05", "Transparency", "Company service", "company", "likert5", LIKERT],
  ["C06", "Systems & technology", "Company service", "company", "likert5", LIKERT],
  ["C07", "Online resources", "Company service", "company", "likert5", LIKERT],
  ["C08", "Board training resources", "Company service", "company", "likert5", LIKERT],
  ["C09", "New concerns", "Open feedback", "company", "open_text", null],
  ["C10", "Focus areas for the company", "Open feedback", "company", "open_text", null],
  ["C11", "Change in board support", "Churn signal", "company", "open_text", null],
  ["C12", "Reason for NPS change", "Open feedback", "company", "open_text", null],

  // Community management effectiveness (rates the service on THIS community)
  ["Y01", "Deed restriction enforcement", "Community management", "community", "likert5", LIKERT],
  ["Y02", "Common area maintenance", "Community management", "community", "likert5", LIKERT],
  ["Y03", "Monthly report quality", "Community management", "community", "likert5", LIKERT],
  ["Y04", "Annual meeting preparation", "Community management", "community", "likert5", LIKERT],
  ["Y05", "Responsiveness to owners", "Community management", "community", "likert5", LIKERT],
  ["Y06", "Member communications", "Community management", "community", "likert5", LIKERT],
  ["Y07", "Records management", "Community management", "community", "likert5", LIKERT],
  ["Y08", "Community priorities", "Open feedback", "community", "open_text", null],

  // Manager (the assigned person)
  ["M01", "Manager overall performance", "Manager", "manager", "likert5", LIKERT],
  ["M02", "Knowledgeable", "Manager", "manager", "likert5", LIKERT],
  ["M03", "Good communicator", "Manager", "manager", "likert5", LIKERT],
  ["M04", "Responsive", "Manager", "manager", "likert5", LIKERT],
  ["M05", "Professional", "Manager", "manager", "likert5", LIKERT],
  ["M06", "Friendly", "Manager", "manager", "likert5", LIKERT],
  ["M07", "Prepared for meetings", "Manager", "manager", "likert5", LIKERT],
  ["M08", "Organized", "Manager", "manager", "likert5", LIKERT],
  ["M09", "Keeps board informed", "Manager", "manager", "likert5", LIKERT],
  ["M10", "Understands board goals", "Manager", "manager", "likert5", LIKERT],
  ["M11", "Vendor management", "Manager", "manager", "likert5", LIKERT],
  ["M12", "Meeting participation", "Manager", "manager", "likert5", LIKERT],
  ["M13", "Prioritization", "Manager", "manager", "likert5", LIKERT],
  ["M14", "Proactive post-meeting communication", "Manager", "manager", "likert5", LIKERT],
  ["M15", "Manager comments", "Open feedback", "manager", "open_text", null],

  // Financial / bookkeeper
  ["F01", "Financial report accuracy", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F02", "Financial report timeliness", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F03", "Accounts receivable handling", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F04", "Collections process", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F05", "Accounts payable handling", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F06", "Budget management", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F07", "Budget preparation", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F08", "Reserve planning", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F09", "Financial reporting overall", "Financials", "bookkeeper", "likert5", LIKERT],
  ["F10", "Financial comments", "Open feedback", "bookkeeper", "open_text", null],
];

// label, description
const TRIGGERS = [
  [
    "manager complaints",
    "resident complains about the manager's behavior, attitude, or performance",
  ],
  [
    "vendor issues",
    "resident mentions problems with vendors, landscaping, maintenance contractors, or work quality",
  ],
  ["responsiveness", "resident mentions slow responses, unreturned calls, or unanswered emails"],
  [
    "finance keywords",
    "resident mentions financial reports, budgets, dues, assessments, or accounting",
  ],
  [
    "specific incident named",
    "resident describes a specific incident, meeting, or event involving a named person",
  ],
  ["board meeting mentions", "resident talks about board meetings or meeting preparation"],
];

// Default (self-signup) template: code, tier, sort, npsBandMax, triggerLabels
const DEFAULT_TEMPLATE_QUESTIONS = [
  ["Q001", "required", 0, null, []],
  ["C01", "required", 1, null, []],
  ["C03", "required", 2, null, []],
  ["M01", "required", 3, null, []],
  ["M04", "contextual", 4, 6, ["responsiveness", "manager complaints"]],
  ["F01", "contextual", 5, null, ["finance keywords"]],
  ["M07", "contextual", 6, null, ["board meeting mentions", "specific incident named"]],
];

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN (no writes)"}`);
  console.log(`DB:   ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}\n`);

  await client.query("BEGIN");
  try {
    // Questions — keyed on code
    let qNew = 0;
    for (const [code, label, category, entity, format, config] of QUESTIONS) {
      const existing = await client.query("SELECT id FROM survey_questions WHERE code = $1", [
        code,
      ]);
      if (existing.rowCount > 0) continue;
      qNew++;
      console.log(`  + question ${code} — ${label}`);
      if (APPLY) {
        await client.query(
          `INSERT INTO survey_questions (code, label, category, entity_target, answer_format, format_config)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [code, label, category, entity, format, config ? JSON.stringify(config) : null]
        );
      }
    }

    // Triggers — keyed on label
    let tNew = 0;
    for (const [label, description] of TRIGGERS) {
      const existing = await client.query("SELECT id FROM survey_triggers WHERE label = $1", [
        label,
      ]);
      if (existing.rowCount > 0) continue;
      tNew++;
      console.log(`  + trigger "${label}"`);
      if (APPLY) {
        await client.query("INSERT INTO survey_triggers (label, description) VALUES ($1, $2)", [
          label,
          description,
        ]);
      }
    }

    // Default template — keyed on is_default
    const defaultExists = await client.query(
      "SELECT id FROM survey_templates WHERE is_default = TRUE LIMIT 1"
    );
    if (defaultExists.rowCount > 0) {
      console.log(
        `\nDefault template already exists (id=${defaultExists.rows[0].id}) — leaving it alone.`
      );
    } else {
      // Publishing the GLOBAL default flips every client without a
      // client-specific template to the hybrid flow at once. On a
      // production DB with live clients that's a big-bang switch — so
      // publishing is OPT-IN (--publish-default). Without the flag the
      // full draft is composed and editable in the builder, but no
      // session binds it: everyone keeps the legacy flow until it's
      // deliberately published.
      console.log(
        `\n  + Default template "Self-Signup Baseline" (${DEFAULT_TEMPLATE_QUESTIONS.length} questions)` +
          (PUBLISH_DEFAULT
            ? " + publish v1"
            : " as UNPUBLISHED draft — publish from the builder or re-run with --publish-default")
      );
      if (APPLY) {
        const tRes = await client.query(
          `INSERT INTO survey_templates (client_id, name, is_default) VALUES (NULL, 'Self-Signup Baseline', TRUE) RETURNING id`
        );
        const templateId = tRes.rows[0].id;

        const configQuestions = [];
        for (const [code, tier, sort, npsBandMax, triggerLabels] of DEFAULT_TEMPLATE_QUESTIONS) {
          const q = (await client.query("SELECT * FROM survey_questions WHERE code = $1", [code]))
            .rows[0];
          if (!q) throw new Error(`Seed inconsistency: question ${code} missing`);

          const tqRes = await client.query(
            `INSERT INTO survey_template_questions (template_id, question_id, tier, sort_order, nps_band_max)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [templateId, q.id, tier, sort, npsBandMax]
          );

          const triggers = [];
          for (const tl of triggerLabels) {
            const trig = (
              await client.query("SELECT * FROM survey_triggers WHERE label = $1", [tl])
            ).rows[0];
            if (!trig) throw new Error(`Seed inconsistency: trigger "${tl}" missing`);
            await client.query(
              "INSERT INTO survey_template_question_triggers (template_question_id, trigger_id) VALUES ($1, $2)",
              [tqRes.rows[0].id, trig.id]
            );
            triggers.push({ id: trig.id, label: trig.label, description: trig.description });
          }

          configQuestions.push({
            question_id: q.id,
            code: q.code,
            label: q.label,
            category: q.category,
            entity_target: q.entity_target,
            answer_format: q.answer_format,
            format_config: q.format_config,
            chat_phrasing: q.chat_phrasing,
            tier,
            sort_order: sort,
            nps_band_max: npsBandMax,
            triggers,
          });
        }

        if (PUBLISH_DEFAULT) {
          await client.query(
            `INSERT INTO survey_template_versions (template_id, version_number, config_jsonb, published_by)
             VALUES ($1, 1, $2, 'seed-survey-catalog.js')`,
            [templateId, JSON.stringify({ questions: configQuestions })]
          );
        }
      }
    }

    if (APPLY) {
      await client.query("COMMIT");
      console.log(`\n✓ COMMITTED — ${qNew} questions, ${tNew} triggers seeded.`);
    } else {
      await client.query("ROLLBACK");
      console.log(
        `\n✓ DRY-RUN complete — would seed ${qNew} questions, ${tNew} triggers. Re-run with --apply.`
      );
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
