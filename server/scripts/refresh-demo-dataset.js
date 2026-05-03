/* eslint-disable no-console */
/**
 * Refresh the Zee Best Management demo dataset (client_id = 1):
 *   1. Rewrite every BOARD MEMBER (users) email + matching historical
 *      sessions.email to a deterministic @mailinator.com address so we
 *      can test invite sending and click-through against real public
 *      inboxes.
 *   2. Add additional communities and board members to make the demo
 *      look like a more representative management-company tenant.
 *
 * IMPORTANT — this script does NOT touch client_admins. Tenant admin
 * logins (including mikehardy73@gmail.com on the demo) are preserved
 * intact. Only board-member-side data is rewritten.
 *
 * SAFETY — this script will REFUSE to run if any of these checks fail:
 *   • DEMO_CLIENT_ID is not 1
 *   • The client at id=1 is not named "Zee Best Management"
 *   • DATABASE_URL is not set
 *   • You did not pass --apply (default is DRY-RUN)
 *
 * It also wraps every mutation in a single transaction. Any failure
 * mid-way rolls back ALL changes.
 *
 * Every UPDATE / INSERT carries an explicit `WHERE client_id = $1`
 * (or `client_id` column) so a typo cannot leak into another tenant.
 *
 * Usage:
 *   # Dry-run (default — prints what WOULD change, mutates nothing):
 *   node server/scripts/refresh-demo-dataset.js
 *
 *   # Actually apply the changes:
 *   node server/scripts/refresh-demo-dataset.js --apply
 *
 *   # Re-running is safe — email mapping is deterministic and the
 *   # community/member additions are skip-if-exists.
 */

import pg from "pg";
const { Client } = pg;

// ── Configuration ────────────────────────────────────────────────────
const DEMO_CLIENT_ID = 1;
const EXPECTED_CLIENT_NAME = "Zee Best Management";
const MAILINATOR_DOMAIN = "mailinator.com";
const APPLY = process.argv.includes("--apply");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("✗ DATABASE_URL not set. Aborting.");
  process.exit(1);
}

// ── Member rename overrides ──────────────────────────────────────────
// Some existing members need their NAME changed too, not just their
// email. Mapping is by current email so re-runs stay deterministic.
//
// mike@fetchrocket.com is "Mike Hardy" in the DB — but the demo's
// founder admin (mikehardy73@gmail.com) is also "Mike Hardy". Two
// "Mike Hardy"s in the same demo is confusing, so this member becomes
// "Mike Carter" with email mike.carter@mailinator.com.
const RENAME_MEMBERS = {
  "mike@fetchrocket.com": { first_name: "Mike", last_name: "Carter" },
};

// ── New communities to add ───────────────────────────────────────────
const NEW_COMMUNITIES = [
  {
    community_name: "Maple Ridge Townhomes",
    community_manager_name: "Brenda Kim",
    property_type: "townhome",
    number_of_units: 64,
    contract_value: 38400,
  },
  {
    community_name: "Sunset Bay Condos",
    community_manager_name: "Marcus Lee",
    property_type: "condo",
    number_of_units: 142,
    contract_value: 71000,
  },
  {
    community_name: "Stonecreek Village",
    community_manager_name: "Sarah Patel",
    property_type: "single_family",
    number_of_units: 96,
    contract_value: 48000,
  },
  {
    community_name: "Brookwood Commons",
    community_manager_name: "Devon Walker",
    property_type: "mixed",
    number_of_units: 78,
    contract_value: 39000,
  },
  {
    community_name: "Ironwood Estates",
    community_manager_name: "Linda Chen",
    property_type: "single_family",
    number_of_units: 52,
    contract_value: 31200,
  },
  {
    community_name: "Lakeshore Pointe",
    community_manager_name: "James O'Connor",
    property_type: "condo",
    number_of_units: 188,
    contract_value: 94000,
  },
];

// ── New board members per community ──────────────────────────────────
// Every (first, last) pair across the WHOLE list is unique so the
// firstname.lastname@mailinator.com scheme produces a unique inbox per
// person — easy to type, easy to check.
const NEW_MEMBERS_BY_COMMUNITY = {
  "Maple Ridge Townhomes": [
    ["Janet", "Holloway", "President"],
    ["Marcus", "Bell", "Treasurer"],
    ["Priya", "Iyer", "Secretary"],
    ["Theo", "Ramirez", "Member"],
    ["Helen", "Schultz", "Member"],
  ],
  "Sunset Bay Condos": [
    ["Carlos", "Mendez", "President"],
    ["Naomi", "Park", "Treasurer"],
    ["Trevor", "Bowman", "Secretary"],
    ["Olivia", "Chen", "Member"],
    ["Frank", "Devlin", "Member"],
  ],
  "Stonecreek Village": [
    ["Hannah", "Foster", "President"],
    ["Diego", "Ruiz", "Treasurer"],
    ["Yvette", "Kapoor", "Secretary"],
    ["Ben", "Walters", "Member"],
    ["Sofia", "Reilly", "Member"],
  ],
  "Brookwood Commons": [
    ["Aaron", "Whitley", "President"],
    ["Lila", "Thompson", "Treasurer"],
    ["Greg", "Tanaka", "Secretary"],
    ["Lauren", "Pike", "Member"],
    ["Hugo", "Bauer", "Member"],
  ],
  "Ironwood Estates": [
    ["Patricia", "Olsen", "President"],
    ["Wesley", "Burns", "Treasurer"],
    ["Camila", "Reyes", "Secretary"],
    ["Drew", "Steiner", "Member"],
    ["Iris", "Chowdhury", "Member"],
  ],
  "Lakeshore Pointe": [
    ["Roland", "Pierce", "President"],
    ["Tina", "Beaumont", "Treasurer"],
    ["Quinn", "Holt", "Secretary"],
    ["Jenna", "Whitaker", "Member"],
    ["Otis", "Nakamura", "Member"],
  ],
};

const ADDITIONAL_MEMBERS_FOR_EXISTING_COMMUNITIES = {
  "Largo Court": [
    ["Kara", "Brennan", "Member"],
    ["Phil", "Tatum", "Member"],
    ["Yvonne", "Wilks", "Member"],
  ],
  "Hilltop Highlands": [
    ["Dale", "McEvoy", "Member"],
    ["Aisha", "Whitfield", "Member"],
    ["Nathan", "Park", "Member"],
  ],
  "Grapevine Estates": [
    ["Beatrice", "Holland", "Member"],
    ["Chad", "Vanover", "Member"],
    ["Renee", "Sutton", "Member"],
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────

function slug(s) {
  // Strip everything that isn't [a-z0-9]. Keeps the email local-part
  // short and predictable: "O'Connor" → "oconnor".
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Build a deterministic short mailinator address from first + last name.
 * Format: firstname.lastname@mailinator.com — easy to type into the
 * mailinator inbox checker.
 *
 * Falls back to a stable hash of the original email when names are
 * missing, so re-runs always produce the same address.
 */
function mailinatorFromName(first, last, fallbackSeed) {
  const f = slug(first);
  const l = slug(last);
  if (f && l) return `${f}.${l}@${MAILINATOR_DOMAIN}`;
  if (f) return `${f}@${MAILINATOR_DOMAIN}`;
  let h = 0;
  for (const ch of String(fallbackSeed || "")) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `demo${h.toString(36)}@${MAILINATOR_DOMAIN}`;
}

function logHeader(s) {
  const bar = "─".repeat(s.length + 2);
  console.log(`\n┌${bar}┐\n│ ${s} │\n└${bar}┘`);
}

function logChange(action, detail) {
  const tag = APPLY ? "APPLY" : "DRY  ";
  console.log(`  [${tag}] ${action.padEnd(18)} ${detail}`);
}

// ── Main ─────────────────────────────────────────────────────────────

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();

  // ── Sanity gate ────────────────────────────────────────────────────
  const tenant = await client.query(`SELECT id, company_name, status FROM clients WHERE id = $1`, [
    DEMO_CLIENT_ID,
  ]);
  if (tenant.rowCount !== 1) {
    throw new Error(`Expected exactly one client at id=${DEMO_CLIENT_ID}, got ${tenant.rowCount}`);
  }
  const tenantRow = tenant.rows[0];
  if (tenantRow.company_name !== EXPECTED_CLIENT_NAME) {
    throw new Error(
      `Refusing to run: client id=${DEMO_CLIENT_ID} is "${tenantRow.company_name}", ` +
        `not "${EXPECTED_CLIENT_NAME}". This script only refreshes the demo tenant.`
    );
  }

  console.log(`Mode:    ${APPLY ? "APPLY (mutations will commit)" : "DRY-RUN (no writes)"}`);
  console.log(
    `Tenant:  id=${tenantRow.id} · ${tenantRow.company_name} · status=${tenantRow.status}`
  );
  console.log(`DB:      ${DB_URL.replace(/:\/\/[^@]+@/, "://***@")}`);
  console.log(`\nNote: client_admins are NOT touched by this script. Admin logins stay intact.`);

  await client.query("BEGIN");

  try {
    // ── 1. Rewrite member (users) emails + names to mailinator ─────
    logHeader("1. Rewrite users (board members) emails → mailinator");
    const members = await client.query(
      `SELECT id, email, first_name, last_name, community_name
         FROM users
        WHERE client_id = $1
        ORDER BY id`,
      [DEMO_CLIENT_ID]
    );
    console.log(`  Found ${members.rowCount} board member(s)`);

    // Tracks new emails being assigned this run so we can detect any
    // collisions BEFORE they become a UNIQUE-constraint failure.
    const newEmailsThisRun = new Map(); // newEmail -> "source description"
    const emailMap = new Map(); // old email -> new email (for sessions)

    for (const m of members.rows) {
      // Apply name override if there is one.
      const override = RENAME_MEMBERS[m.email];
      const finalFirst = override?.first_name ?? m.first_name;
      const finalLast = override?.last_name ?? m.last_name;
      const newEmail = mailinatorFromName(finalFirst, finalLast, m.email);
      emailMap.set(m.email, newEmail);

      // Within-run collision guard.
      if (newEmailsThisRun.has(newEmail)) {
        throw new Error(
          `Email collision in this run: ${newEmail} would be used by both ` +
            `"${newEmailsThisRun.get(newEmail)}" and "users.id=${m.id}". ` +
            `Add a RENAME_MEMBERS entry for ${m.email} to disambiguate.`
        );
      }
      newEmailsThisRun.set(newEmail, `users.id=${m.id} (${m.email})`);

      const renameNote = override
        ? ` [renamed: ${m.first_name || "?"} ${m.last_name || "?"} → ${finalFirst} ${finalLast}]`
        : "";

      if (m.email === newEmail && !override) {
        logChange("member (skip)", `id=${m.id} already on mailinator: ${m.email}`);
        continue;
      }
      logChange("member", `id=${m.id}  ${m.email}  →  ${newEmail}${renameNote}`);

      if (APPLY) {
        // Pre-flight collision check against existing rows.
        const collision = await client.query(
          `SELECT id FROM users WHERE email = $1 AND client_id = $2 AND id <> $3`,
          [newEmail, DEMO_CLIENT_ID, m.id]
        );
        if (collision.rowCount > 0) {
          throw new Error(
            `Email collision: trying to set users.id=${m.id} to ${newEmail} ` +
              `but users.id=${collision.rows[0].id} already has it. Add RENAME_MEMBERS entry.`
          );
        }
        // Update email + name in one go (name only changes if override).
        await client.query(
          `UPDATE users
              SET email = $1, first_name = $2, last_name = $3
            WHERE id = $4 AND client_id = $5`,
          [newEmail, finalFirst, finalLast, m.id, DEMO_CLIENT_ID]
        );
      }
    }

    // ── 2. Rewrite historical session emails to match new users ────
    logHeader("2. Rewrite sessions.email to match renamed members");
    const sessionsByEmail = await client.query(
      `SELECT email, COUNT(*)::int as c
         FROM sessions
        WHERE client_id = $1
        GROUP BY email
        ORDER BY email`,
      [DEMO_CLIENT_ID]
    );
    let sessionsTouched = 0;
    for (const row of sessionsByEmail.rows) {
      const newEmail = emailMap.get(row.email);
      if (!newEmail || newEmail === row.email) continue;
      logChange("sessions", `${row.c}× ${row.email} → ${newEmail}`);
      sessionsTouched += row.c;
      if (APPLY) {
        await client.query(`UPDATE sessions SET email = $1 WHERE email = $2 AND client_id = $3`, [
          newEmail,
          row.email,
          DEMO_CLIENT_ID,
        ]);
      }
    }
    console.log(`  Total session rows touched: ${sessionsTouched}`);

    // ── 3. Add new communities ─────────────────────────────────────
    logHeader("3. Add new communities");
    for (const c of NEW_COMMUNITIES) {
      const existing = await client.query(
        `SELECT id FROM communities WHERE client_id = $1 AND community_name = $2`,
        [DEMO_CLIENT_ID, c.community_name]
      );
      if (existing.rowCount > 0) {
        logChange(
          "community (skip)",
          `${c.community_name} (already exists, id=${existing.rows[0].id})`
        );
        continue;
      }
      logChange(
        "community",
        `${c.community_name} · ${c.property_type} · ${c.number_of_units} units · CM ${c.community_manager_name}`
      );
      if (APPLY) {
        await client.query(
          `INSERT INTO communities
             (client_id, community_name, community_manager_name, property_type, number_of_units, contract_value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            DEMO_CLIENT_ID,
            c.community_name,
            c.community_manager_name,
            c.property_type,
            c.number_of_units,
            c.contract_value,
          ]
        );
      }
    }

    // ── 4. Add new board members ───────────────────────────────────
    logHeader("4. Add new board members");

    // Build the additions list. Names are unique per community AND
    // unique across all 6 new communities, so the firstname.lastname
    // email scheme cannot collide.
    const additions = [];
    for (const [community, list] of Object.entries(NEW_MEMBERS_BY_COMMUNITY)) {
      for (const [first, last, _role] of list) {
        additions.push({ community, first, last });
      }
    }
    for (const [community, list] of Object.entries(ADDITIONAL_MEMBERS_FOR_EXISTING_COMMUNITIES)) {
      for (const [first, last, _role] of list) {
        additions.push({ community, first, last });
      }
    }
    console.log(`  Planned: ${additions.length} new board member(s)`);

    for (const m of additions) {
      const email = mailinatorFromName(m.first, m.last, `${m.community}|${m.first}|${m.last}`);

      // Within-run collision guard against renames in step 1.
      if (newEmailsThisRun.has(email)) {
        const owner = newEmailsThisRun.get(email);
        if (!owner.includes("ADD")) {
          throw new Error(
            `Email collision: "${m.first} ${m.last}" would use ${email} ` +
              `but it's already claimed by ${owner}. Pick a different name.`
          );
        }
      }
      newEmailsThisRun.set(email, `ADD ${m.first} ${m.last} → ${m.community}`);

      // Resolve community_id if possible.
      const commRow = APPLY
        ? await client.query(
            `SELECT id FROM communities WHERE client_id = $1 AND community_name = $2`,
            [DEMO_CLIENT_ID, m.community]
          )
        : { rowCount: 1, rows: [{ id: "(dry-run)" }] };
      if (commRow.rowCount === 0) {
        logChange("member (skip)", `${m.first} ${m.last} — community "${m.community}" not found`);
        continue;
      }

      // Skip-if-exists for idempotency.
      const existing = await client.query(
        `SELECT id FROM users WHERE client_id = $1 AND email = $2`,
        [DEMO_CLIENT_ID, email]
      );
      if (existing.rowCount > 0) {
        logChange("member (skip)", `${email} (id=${existing.rows[0].id} already exists)`);
        continue;
      }

      logChange("member", `${m.first} ${m.last} · ${m.community} · ${email}`);
      if (APPLY) {
        await client.query(
          `INSERT INTO users
             (client_id, first_name, last_name, email, community_name, community_id, active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
          [DEMO_CLIENT_ID, m.first, m.last, email, m.community, commRow.rows[0].id]
        );
      }
    }

    // ── Commit / rollback ──────────────────────────────────────────
    if (APPLY) {
      await client.query("COMMIT");
      console.log("\n✓ COMMITTED — changes applied to client_id=1.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n✓ DRY-RUN complete — no changes applied. Re-run with --apply to commit.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n✗ Aborted, rolled back. Cause:");
    console.error(err);
    process.exitCode = 1;
  }

  // Summary
  if (APPLY && process.exitCode !== 1) {
    const finalCounts = await Promise.all([
      client.query(`SELECT COUNT(*)::int c FROM client_admins WHERE client_id = $1`, [
        DEMO_CLIENT_ID,
      ]),
      client.query(`SELECT COUNT(*)::int c FROM users WHERE client_id = $1 AND active = TRUE`, [
        DEMO_CLIENT_ID,
      ]),
      client.query(`SELECT COUNT(*)::int c FROM communities WHERE client_id = $1`, [
        DEMO_CLIENT_ID,
      ]),
      client.query(`SELECT COUNT(*)::int c FROM sessions WHERE client_id = $1`, [DEMO_CLIENT_ID]),
    ]);
    console.log(`\nFinal state of client_id=${DEMO_CLIENT_ID}:`);
    console.log(`  admins:      ${finalCounts[0].rows[0].c}  (untouched by this script)`);
    console.log(`  members:     ${finalCounts[1].rows[0].c}`);
    console.log(`  communities: ${finalCounts[2].rows[0].c}`);
    console.log(`  sessions:    ${finalCounts[3].rows[0].c}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("✗ Fatal:", err);
  client.end().catch(() => {});
  process.exit(1);
});
