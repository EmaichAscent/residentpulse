import db from "../db.js";
import logger from "./logger.js";

/**
 * Log an activity to the global audit trail.
 *
 * @param {Object} params
 * @param {'superadmin'|'client_admin'|'system'} params.actorType
 * @param {number} [params.actorId]
 * @param {string} [params.actorEmail]
 * @param {string} params.action - e.g. "login", "launch_round", "complete_interview"
 * @param {string} [params.entityType] - e.g. "survey_round", "interview", "client"
 * @param {number} [params.entityId]
 * @param {number} [params.clientId]
 * @param {Object} [params.metadata] - arbitrary JSON metadata
 */
export async function logActivity({ actorType, actorId, actorEmail, action, entityType, entityId, clientId, metadata }) {
  try {
    await db.run(
      `INSERT INTO activity_log (actor_type, actor_id, actor_email, action, entity_type, entity_id, client_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorType,
        actorId || null,
        actorEmail || null,
        action,
        entityType || null,
        entityId || null,
        clientId || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (err) {
    // Activity logging should never break the main flow
    logger.error("Failed to log activity: %s", err.message);
  }
}
