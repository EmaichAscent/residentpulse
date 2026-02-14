/**
 * Data migration script from SQLite to PostgreSQL
 *
 * Usage:
 * 1. Set DATABASE_URL in .env to your PostgreSQL connection string
 * 2. Ensure your old SQLite database is at server/residentpulse.db
 * 3. Run: node migrate-to-postgres.js
 *
 * This script will:
 * - Read all data from your SQLite database
 * - Transfer it to PostgreSQL
 * - Preserve all IDs and relationships
 */

import initSqlJs from "sql.js";
import { readFileSync, existsSync } from "fs";
import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";

dotenv.config();

const SQLITE_DB_PATH = "./residentpulse.db";

if (!existsSync(SQLITE_DB_PATH)) {
  console.error(`❌ SQLite database not found at ${SQLITE_DB_PATH}`);
  console.log("If you don't have existing data to migrate, you can skip this script.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment variables");
  console.log("Please set DATABASE_URL in your .env file");
  process.exit(1);
}

console.log("🔄 Starting data migration from SQLite to PostgreSQL...\n");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// Initialize SQLite
const SQL = await initSqlJs();
const buffer = readFileSync(SQLITE_DB_PATH);
const sqliteDb = new SQL.Database(buffer);

// Helper to execute SQLite queries
function sqliteAll(sql) {
  const result = sqliteDb.exec(sql);
  if (!result.length) return [];

  const rows = [];
  const columns = result[0].columns;
  const values = result[0].values;

  for (const row of values) {
    const obj = {};
    columns.forEach((col, i) => (obj[col] = row[i]));
    rows.push(obj);
  }

  return rows;
}

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Migrate clients
    console.log("📦 Migrating clients...");
    const clients = sqliteAll("SELECT * FROM clients");
    for (const c of clients) {
      await client.query(
        `INSERT INTO clients (id, company_name, address_line1, address_line2, city, state, zip, phone_number, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.company_name, c.address_line1, c.address_line2, c.city, c.state, c.zip, c.phone_number, c.status, c.created_at, c.updated_at]
      );
    }
    console.log(`   ✓ Migrated ${clients.length} clients`);

    // Update sequence
    if (clients.length > 0) {
      const maxId = Math.max(...clients.map(c => c.id));
      await client.query(`SELECT setval('clients_id_seq', $1)`, [maxId]);
    }

    // 2. Migrate admins (superadmins)
    console.log("📦 Migrating superadmins...");
    const admins = sqliteAll("SELECT * FROM admins");
    for (const a of admins) {
      await client.query(
        `INSERT INTO admins (id, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.email, a.password_hash, a.role, a.created_at]
      );
    }
    console.log(`   ✓ Migrated ${admins.length} superadmins`);

    if (admins.length > 0) {
      const maxId = Math.max(...admins.map(a => a.id));
      await client.query(`SELECT setval('admins_id_seq', $1)`, [maxId]);
    }

    // 3. Migrate client_admins
    console.log("📦 Migrating client admins...");
    const clientAdmins = sqliteAll("SELECT * FROM client_admins");
    for (const ca of clientAdmins) {
      await client.query(
        `INSERT INTO client_admins (id, client_id, email, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [ca.id, ca.client_id, ca.email, ca.password_hash, ca.created_at]
      );
    }
    console.log(`   ✓ Migrated ${clientAdmins.length} client admins`);

    if (clientAdmins.length > 0) {
      const maxId = Math.max(...clientAdmins.map(ca => ca.id));
      await client.query(`SELECT setval('client_admins_id_seq', $1)`, [maxId]);
    }

    // 4. Migrate users (board members)
    console.log("📦 Migrating board members...");
    const users = sqliteAll("SELECT * FROM users");
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, client_id, first_name, last_name, email, community_name, management_company, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.client_id, u.first_name, u.last_name, u.email, u.community_name, u.management_company, u.updated_at]
      );
    }
    console.log(`   ✓ Migrated ${users.length} board members`);

    if (users.length > 0) {
      const maxId = Math.max(...users.map(u => u.id));
      await client.query(`SELECT setval('users_id_seq', $1)`, [maxId]);
    }

    // 5. Migrate sessions
    console.log("📦 Migrating survey sessions...");
    const sessions = sqliteAll("SELECT * FROM sessions");
    for (const s of sessions) {
      await client.query(
        `INSERT INTO sessions (id, email, nps_score, created_at, completed, summary, community_name, management_company, user_id, client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.email, s.nps_score, s.created_at, s.completed === 1, s.summary, s.community_name, s.management_company, s.user_id, s.client_id]
      );
    }
    console.log(`   ✓ Migrated ${sessions.length} sessions`);

    if (sessions.length > 0) {
      const maxId = Math.max(...sessions.map(s => s.id));
      await client.query(`SELECT setval('sessions_id_seq', $1)`, [maxId]);
    }

    // 6. Migrate messages
    console.log("📦 Migrating chat messages...");
    const messages = sqliteAll("SELECT * FROM messages");
    for (const m of messages) {
      await client.query(
        `INSERT INTO messages (id, session_id, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [m.id, m.session_id, m.role, m.content, m.created_at]
      );
    }
    console.log(`   ✓ Migrated ${messages.length} messages`);

    if (messages.length > 0) {
      const maxId = Math.max(...messages.map(m => m.id));
      await client.query(`SELECT setval('messages_id_seq', $1)`, [maxId]);
    }

    // 7. Migrate settings
    console.log("📦 Migrating settings...");
    const settings = sqliteAll("SELECT * FROM settings");
    for (const setting of settings) {
      // SQLite settings table might not have id column, so handle both cases
      const id = setting.id || null;
      await client.query(
        `INSERT INTO settings (key, value, client_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value`,
        [setting.key, setting.value, setting.client_id || null]
      );
    }
    console.log(`   ✓ Migrated ${settings.length} settings`);

    await client.query("COMMIT");

    console.log("\n✅ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Verify data in PostgreSQL");
    console.log("2. Backup your SQLite database (residentpulse.db) to a safe location");
    console.log("3. Test your application with the new PostgreSQL database");
    console.log("4. Once confirmed working, you can archive the old SQLite db file");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqliteDb.close();
  }
}

migrate();
