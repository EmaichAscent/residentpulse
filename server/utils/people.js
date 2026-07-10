import db from "../db.js";

/**
 * Find-or-create helpers for the managers / bookkeepers rosters
 * (Zoho parity Phase B — docs/ZOHO_PARITY_PLAN.md).
 *
 * The existing UI writes people as free-text names
 * (communities.community_manager_name). These helpers keep the
 * first-class FK layer in sync on every write, so per-person
 * dashboard rollups (Phase E) always have a row to attach to —
 * without changing the UX the operator already knows.
 *
 * Matching is by exact trimmed name within (client_id, is_test).
 * A rename in the UI therefore creates a NEW person — that's
 * deliberate: names are the only identity the string column ever
 * had, and guessing "Deb" == "Debbie" would corrupt rollups. The
 * roster endpoints let an operator merge/retire duplicates later.
 */

async function resolvePersonId(table, clientId, name, isTest) {
  if (table !== "managers" && table !== "bookkeepers") {
    throw new Error(`resolvePersonId: unknown table "${table}"`);
  }
  const trimmed = (name || "").trim();
  if (!trimmed) return null;

  const existing = await db.get(
    `SELECT id FROM ${table} WHERE client_id = ? AND name = ? AND is_test = ?`,
    [clientId, trimmed, isTest]
  );
  if (existing) return existing.id;

  const result = await db.run(
    `INSERT INTO ${table} (client_id, name, is_test) VALUES (?, ?, ?)
     ON CONFLICT (client_id, name, is_test) DO NOTHING`,
    [clientId, trimmed, isTest]
  );
  if (result.lastInsertRowid) return result.lastInsertRowid;

  // Concurrent insert won the race — fetch the row it created.
  const row = await db.get(
    `SELECT id FROM ${table} WHERE client_id = ? AND name = ? AND is_test = ?`,
    [clientId, trimmed, isTest]
  );
  return row?.id ?? null;
}

export function resolveManagerId(clientId, name, isTest) {
  return resolvePersonId("managers", clientId, name, isTest);
}

export function resolveBookkeeperId(clientId, name, isTest) {
  return resolvePersonId("bookkeepers", clientId, name, isTest);
}
