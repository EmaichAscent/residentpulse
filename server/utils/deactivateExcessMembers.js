import db from "../db.js";

/**
 * Deactivate excess board members when a client downgrades to a plan with a lower member limit.
 * Deactivates the most recently added members first.
 * @param {number} clientId
 * @param {number} newLimit - The new member limit
 * @returns {Promise<{deactivatedCount: number, deactivatedMembers: Array}>}
 */
export async function deactivateExcessMembers(clientId, newLimit) {
  const activeCount = await db.get(
    "SELECT COUNT(*) as count FROM board_members WHERE client_id = ? AND is_active = TRUE",
    [clientId]
  );

  const excess = (activeCount?.count || 0) - newLimit;
  if (excess <= 0) {
    return { deactivatedCount: 0, deactivatedMembers: [] };
  }

  // Get the excess members (newest first)
  const excessMembers = await db.all(
    `SELECT id, first_name, last_name, email FROM board_members
     WHERE client_id = ? AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT ?`,
    [clientId, excess]
  );

  if (excessMembers.length > 0) {
    const ids = excessMembers.map(m => m.id);
    await db.run(
      `UPDATE board_members SET is_active = FALSE WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
  }

  return {
    deactivatedCount: excessMembers.length,
    deactivatedMembers: excessMembers,
  };
}
