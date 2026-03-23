/**
 * Seed location data for the demo account (mikehardy73@gmail.com)
 * Creates 2 locations and assigns them to existing communities.
 *
 * Usage: node seed-locations.js
 * Requires DATABASE_URL env var or uses Railway staging default.
 */

import pg from "pg";
const { Client } = pg;

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:GtCwTVodIpMCkILgFAbezqjGXRZflSGV@postgres-bb5.railway.internal:5432/railway";

const client = new Client({
  connectionString: DB_URL,
  ssl: DB_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function main() {
  await client.connect();
  console.log("Connected to database");

  // Find the client
  const clientResult = await client.query(
    `SELECT c.id FROM clients c JOIN admin_users a ON a.client_id = c.id WHERE a.email = 'mikehardy73@gmail.com'`
  );
  if (!clientResult.rows[0]) {
    console.log("Client not found for mikehardy73@gmail.com");
    process.exit(1);
  }
  const clientId = clientResult.rows[0].id;
  console.log("Client ID:", clientId);

  // Define locations
  const locationData = [
    { name: "Tampa Office", communities: ["Largo Court", "Grapevine Estates"] },
    { name: "Orlando Office", communities: ["Hilltop Highlands"] },
  ];

  for (const loc of locationData) {
    // Upsert location
    const existing = await client.query(
      "SELECT id FROM locations WHERE LOWER(TRIM(name)) = $1 AND client_id = $2 AND is_test = false",
      [loc.name.toLowerCase(), clientId]
    );

    let locationId;
    if (existing.rows[0]) {
      locationId = existing.rows[0].id;
      console.log(`Location "${loc.name}" already exists (id: ${locationId})`);
    } else {
      const inserted = await client.query(
        "INSERT INTO locations (client_id, name, is_test) VALUES ($1, $2, false) RETURNING id",
        [clientId, loc.name]
      );
      locationId = inserted.rows[0].id;
      console.log(`Created location "${loc.name}" (id: ${locationId})`);
    }

    // Assign communities to this location
    for (const communityName of loc.communities) {
      const result = await client.query(
        "UPDATE communities SET location_id = $1, updated_at = CURRENT_TIMESTAMP WHERE client_id = $2 AND LOWER(TRIM(community_name)) = $3 AND is_test = false",
        [locationId, clientId, communityName.toLowerCase()]
      );
      if (result.rowCount > 0) {
        console.log(`  Assigned "${communityName}" to "${loc.name}"`);
      } else {
        console.log(`  Community "${communityName}" not found — skipped`);
      }
    }
  }

  // Summary
  const summary = await client.query(
    `SELECT c.community_name, l.name as location_name
     FROM communities c
     LEFT JOIN locations l ON l.id = c.location_id
     WHERE c.client_id = $1 AND c.is_test = false
     ORDER BY c.community_name`,
    [clientId]
  );
  console.log("\nFinal community → location mapping:");
  for (const row of summary.rows) {
    console.log(`  ${row.community_name} → ${row.location_name || "(no location)"}`);
  }

  await client.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
