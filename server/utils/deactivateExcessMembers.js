import db from "../db.js";
import logger from "./logger.js";

/**
 * Deactivate excess members when a client downgrades to a plan with a lower member limit.
 * Deactivates the most recently added members first.
 * @param {number} clientId
 * @param {number} newLimit - The new member limit
 * @returns {Promise<{deactivatedCount: number, deactivatedMembers: Array}>}
 */
export async function deactivateExcessMembers(clientId, newLimit) {
  const activeCount = await db.get(
    "SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE",
    [clientId]
  );

  const excess = (activeCount?.count || 0) - newLimit;
  if (excess <= 0) {
    return { deactivatedCount: 0, deactivatedMembers: [] };
  }

  // Get the excess members (newest first)
  const excessMembers = await db.all(
    `SELECT id, first_name, last_name, email FROM users
     WHERE client_id = ? AND active = TRUE
     ORDER BY created_at DESC
     LIMIT ?`,
    [clientId, excess]
  );

  if (excessMembers.length > 0) {
    const ids = excessMembers.map(m => m.id);
    await db.run(
      `UPDATE users SET active = FALSE WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    logger.info({ clientId, deactivatedCount: excessMembers.length }, "Deactivated excess members after downgrade");
  }

  return {
    deactivatedCount: excessMembers.length,
    deactivatedMembers: excessMembers,
  };
}
