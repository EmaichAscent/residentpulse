/**
 * Rebalance demo data: 8-12 communities per manager, each manager tied to one location.
 * Run: $env:DATABASE_URL="postgresql://..."; node server/seed-rebalance-managers.js
 */

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function rebalance() {
  const client = await pool.connect();

  try {
    // Find the client
    const clientResult = await client.query(
      `SELECT c.id FROM clients c JOIN client_admins a ON a.client_id = c.id WHERE a.email = 'mikehardy73@gmail.com'`
    );
    if (clientResult.rows.length === 0) {
      console.error("Client not found");
      process.exit(1);
    }
    const clientId = clientResult.rows[0].id;
    console.log(`Client ID: ${clientId}`);

    // Get locations
    const locations = await client.query(
      "SELECT id, name FROM locations WHERE client_id = $1 ORDER BY id",
      [clientId]
    );
    console.log(`\nLocations: ${locations.rows.map(l => l.name).join(", ")}`);

    // Get all active communities
    const communities = await client.query(
      "SELECT id, community_name, location_id, community_manager_name FROM communities WHERE client_id = $1 AND status = 'active' AND is_test = false ORDER BY id",
      [clientId]
    );
    const totalCommunities = communities.rows.length;
    console.log(`Total communities: ${totalCommunities}`);

    // Define managers — 2-3 per location, targeting 8-12 communities each
    // With 110 communities and ~10 per manager, we need ~11 managers
    const managersByLocation = {
      "Tampa Bay Office": ["Jennifer Thompson", "Michael Rodriguez"],
      "Orlando Office": ["Sarah Martinez", "David Anderson"],
      "Miami Office": ["Amanda Williams", "Robert Johnson", "Lisa Garcia"],
      "Jacksonville Office": ["James Brown", "Michelle Davis"],
      "Ft. Lauderdale Office": ["Daniel Wilson", "Patricia Miller"],
    };

    // Build flat manager list with location assignments
    const managers = [];
    for (const loc of locations.rows) {
      const locManagers = managersByLocation[loc.name] || [];
      for (const name of locManagers) {
        managers.push({ name, locationId: loc.id, locationName: loc.name });
      }
    }
    console.log(`\nManagers: ${managers.length}`);
    managers.forEach(m => console.log(`  ${m.name} — ${m.locationName}`));

    // Distribute communities evenly across managers
    // First, group communities by their current location
    const commsByLocation = {};
    for (const loc of locations.rows) {
      commsByLocation[loc.id] = communities.rows.filter(c => c.location_id === loc.id);
    }

    // Assign communities to managers within their location
    let assignmentCount = 0;
    for (const loc of locations.rows) {
      const locCommunities = commsByLocation[loc.id] || [];
      const locManagers = managers.filter(m => m.locationId === loc.id);
      if (locManagers.length === 0 || locCommunities.length === 0) continue;

      // Round-robin assign communities to managers in this location
      for (let i = 0; i < locCommunities.length; i++) {
        const mgr = locManagers[i % locManagers.length];
        await client.query(
          "UPDATE communities SET community_manager_name = $1 WHERE id = $2",
          [mgr.name, locCommunities[i].id]
        );
        assignmentCount++;
      }
    }
    console.log(`\nReassigned ${assignmentCount} communities`);

    // Also update the round_community_snapshots to match
    for (const loc of locations.rows) {
      const locCommunities = commsByLocation[loc.id] || [];
      const locManagers = managers.filter(m => m.locationId === loc.id);
      if (locManagers.length === 0 || locCommunities.length === 0) continue;

      for (let i = 0; i < locCommunities.length; i++) {
        const mgr = locManagers[i % locManagers.length];
        await client.query(
          "UPDATE round_community_snapshots SET community_manager_name = $1 WHERE community_id = $2",
          [mgr.name, locCommunities[i].id]
        );
      }
    }
    console.log("Updated round snapshots to match");

    // Print summary
    const summary = await client.query(
      `SELECT c.community_manager_name as manager, l.name as location, COUNT(*) as communities
       FROM communities c
       LEFT JOIN locations l ON l.id = c.location_id
       WHERE c.client_id = $1 AND c.status = 'active' AND c.is_test = false
       GROUP BY c.community_manager_name, l.name
       ORDER BY l.name, c.community_manager_name`,
      [clientId]
    );

    console.log("\n--- FINAL DISTRIBUTION ---");
    let currentLoc = "";
    for (const row of summary.rows) {
      if (row.location !== currentLoc) {
        currentLoc = row.location;
        console.log(`\n${currentLoc}:`);
      }
      console.log(`  ${row.manager}: ${row.communities} communities`);
    }

  } catch (err) {
    console.error("Rebalance failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

rebalance();
