/**
 * Seed communities table from existing board member community_name values.
 * Run this for all paid-tier clients whose board members have community names
 * but no corresponding communities table entries.
 *
 * Usage: node seed-communities.js [--client-id <id>]
 *   No args: seeds all paid-tier clients
 *   --client-id <id>: seeds a specific client only
 *
 * Safe to run multiple times — only creates communities that don't already exist.
 */

import "dotenv/config";
import { pool } from "./db.js";

const args = process.argv.slice(2);
let targetClientId = null;

if (args[0] === "--client-id" && args[1]) {
  targetClientId = Number(args[1]);
  if (isNaN(targetClientId)) {
    console.error("Invalid client ID");
    process.exit(1);
  }
}

async function seedCommunities() {
  try {
    // Find clients to process
    let clients;
    if (targetClientId) {
      clients = await pool.query(
        `SELECT c.id, c.company_name, sp.name as plan_name
         FROM clients c
         LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
         LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
         WHERE c.id = $1`,
        [targetClientId]
      );
    } else {
      // All paid-tier clients
      clients = await pool.query(
        `SELECT c.id, c.company_name, sp.name as plan_name
         FROM clients c
         JOIN client_subscriptions cs ON cs.client_id = c.id
         JOIN subscription_plans sp ON sp.id = cs.plan_id
         WHERE sp.name != 'free'`
      );
    }

    if (clients.rows.length === 0) {
      console.log("No clients to process.");
      process.exit(0);
    }

    console.log(`Processing ${clients.rows.length} client(s)...\n`);

    let totalCreated = 0;
    let totalLinked = 0;

    for (const client of clients.rows) {
      console.log(`--- ${client.company_name} (ID: ${client.id}, Plan: ${client.plan_name}) ---`);

      // Get distinct community names from board members not already in communities table
      const distinctNames = await pool.query(
        `SELECT DISTINCT community_name FROM users
         WHERE client_id = $1 AND community_name IS NOT NULL AND TRIM(community_name) != '' AND active = TRUE
         AND LOWER(TRIM(community_name)) NOT IN (
           SELECT LOWER(TRIM(community_name)) FROM communities WHERE client_id = $1
         )`,
        [client.id]
      );

      if (distinctNames.rows.length === 0) {
        console.log("  No new communities to create.");
      } else {
        for (const row of distinctNames.rows) {
          await pool.query(
            "INSERT INTO communities (client_id, community_name) VALUES ($1, $2)",
            [client.id, row.community_name.trim()]
          );
          console.log(`  Created: ${row.community_name.trim()}`);
          totalCreated++;
        }
      }

      // Auto-link users to communities
      const linkResult = await pool.query(
        `UPDATE users u SET community_id = c.id
         FROM communities c
         WHERE u.client_id = c.client_id AND u.client_id = $1
           AND LOWER(TRIM(u.community_name)) = LOWER(TRIM(c.community_name))
           AND u.community_id IS NULL`,
        [client.id]
      );
      const linked = linkResult.rowCount || 0;
      if (linked > 0) {
        console.log(`  Linked ${linked} board member(s) to communities.`);
        totalLinked += linked;
      }

      console.log("");
    }

    console.log(`Done. Created ${totalCreated} communities, linked ${totalLinked} board members.`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedCommunities();
