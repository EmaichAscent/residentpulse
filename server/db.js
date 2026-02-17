import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

// Initialize database schema
async function initializeSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create clients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        company_name TEXT NOT NULL,
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        phone_number TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admins table (superadmins)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'superadmin' CHECK(role IN ('superadmin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create client_admins table
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_admins (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        nps_score INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed BOOLEAN DEFAULT FALSE,
        summary TEXT,
        community_name TEXT,
        management_company TEXT,
        user_id INTEGER,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL
      )
    `);

    // Create messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create settings table (with optional client_id for multi-tenant)
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        UNIQUE(key, client_id)
      )
    `);

    // Create users table (board members)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        first_name TEXT,
        last_name TEXT,
        email TEXT NOT NULL,
        community_name TEXT,
        management_company TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email, client_id)
      )
    `);

    // Add active column to existing users tables
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);

    // Add password reset columns to client_admins
    await client.query(`ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS password_reset_token TEXT`);
    await client.query(`ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP`);

    // Create indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_admins_client_id ON client_admins(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_settings_client_id ON settings(client_id)`);

    // Run email invitations migration
    try {
      const migrationPath = join(__dirname, "migrations", "add-email-invitations.sql");
      const migrationSQL = readFileSync(migrationPath, "utf-8");
      await client.query(migrationSQL);
      console.log("Email invitations migration applied successfully");
    } catch (migrationErr) {
      // Migration may have already been applied, or file may not exist yet
      console.log("Email invitations migration skipped (already applied or file not found)");
    }

    // Run subscriptions and signup migration
    try {
      const subMigrationPath = join(__dirname, "migrations", "add-subscriptions-and-signup.sql");
      const subMigrationSQL = readFileSync(subMigrationPath, "utf-8");
      await client.query(subMigrationSQL);
      console.log("Subscriptions and signup migration applied successfully");
    } catch (migrationErr) {
      console.log("Subscriptions and signup migration skipped (already applied or file not found)");
    }

    // Run survey rounds migration
    try {
      const roundsMigrationPath = join(__dirname, "migrations", "add-survey-rounds.sql");
      const roundsMigrationSQL = readFileSync(roundsMigrationPath, "utf-8");
      await client.query(roundsMigrationSQL);
      console.log("Survey rounds migration applied successfully");
    } catch (migrationErr) {
      console.log("Survey rounds migration skipped (already applied or file not found)");
    }

    // Run admin interviews migration
    try {
      const interviewMigrationPath = join(__dirname, "migrations", "add-admin-interviews.sql");
      const interviewMigrationSQL = readFileSync(interviewMigrationPath, "utf-8");
      await client.query(interviewMigrationSQL);
      console.log("Admin interviews migration applied successfully");
    } catch (migrationErr) {
      console.log("Admin interviews migration skipped (already applied or file not found)");
    }

    // Run dashboard redesign migration (insights + critical alerts)
    try {
      const dashboardMigrationPath = join(__dirname, "migrations", "add-dashboard-redesign.sql");
      const dashboardMigrationSQL = readFileSync(dashboardMigrationPath, "utf-8");
      await client.query(dashboardMigrationSQL);
      console.log("Dashboard redesign migration applied successfully");
    } catch (migrationErr) {
      console.log("Dashboard redesign migration skipped (already applied or file not found)");
    }

    // Run communities migration (paid-tier community data)
    try {
      const communitiesMigrationPath = join(__dirname, "migrations", "add-communities.sql");
      const communitiesMigrationSQL = readFileSync(communitiesMigrationPath, "utf-8");
      await client.query(communitiesMigrationSQL);
      console.log("Communities migration applied successfully");
    } catch (migrationErr) {
      console.log("Communities migration skipped (already applied or file not found)");
    }

    // Auto-link existing users to communities by matching community_name
    try {
      await client.query(`
        UPDATE users u SET community_id = c.id
        FROM communities c
        WHERE u.client_id = c.client_id
          AND LOWER(TRIM(u.community_name)) = LOWER(TRIM(c.community_name))
          AND u.community_id IS NULL
      `);
    } catch (linkErr) {
      // Silently skip if communities table doesn't exist yet
    }

    await client.query("COMMIT");
    console.log("Database schema initialized successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error initializing schema:", err);
    throw err;
  } finally {
    client.release();
  }
}

// Helper: run a statement and return changes info (for INSERT/UPDATE/DELETE)
async function run(sql, params = []) {
  const client = await pool.connect();
  try {
    // Convert ? placeholders to $1, $2, etc for PostgreSQL
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    const result = await client.query(pgSql + " RETURNING id", params);
    return {
      lastInsertRowid: result.rows[0]?.id || null,
      changes: result.rowCount
    };
  } catch (err) {
    // If RETURNING id fails (UPDATE/DELETE), try without it
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await client.query(pgSql, params);
    return {
      lastInsertRowid: null,
      changes: result.rowCount
    };
  } finally {
    client.release();
  }
}

// Helper: get one row
async function get(sql, params = []) {
  const client = await pool.connect();
  try {
    // Convert ? placeholders to $1, $2, etc for PostgreSQL
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    const result = await client.query(pgSql, params);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Helper: get all rows
async function all(sql, params = []) {
  const client = await pool.connect();
  try {
    // Convert ? placeholders to $1, $2, etc for PostgreSQL
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    const result = await client.query(pgSql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Initialize schema on module load
await initializeSchema();

const DEFAULT_PROMPT = `You are a friendly, professional data scientist conducting an NPS (Net Promoter Score) survey for a residential management company. You are interviewing board of directors members of HOAs and condo associations.

Guidelines:
- Keep every response to 1-2 short sentences. Never exceed 2 sentences. Be direct and conversational — no filler, no preamble, no restating what they said
- The NPS score has already been collected via the UI widget — do NOT ask for it again
- You will receive the NPS score in the first user message. Acknowledge it in one brief sentence, then ask your first follow-up question in a second sentence
- Ask 3-4 follow-up questions, one at a time, covering these areas:
  1. Why they gave that score — what drove their rating
  2. What the management company does well (communication, responsiveness, financial management, maintenance)
  3. What specific improvements they'd like to see
  4. Any urgent concerns or issues that need immediate attention
- Ask follow-up questions one at a time. The resident can end the session whenever they want using a button in the UI, so do not rush or cut things short — keep the conversation going as long as they are engaged
- If the resident seems done or says goodbye, thank them briefly in one sentence
- Do not use markdown formatting, bullet points, or numbered lists — just plain conversational text
- Never summarize, paraphrase, or echo back what the resident just told you — just move to the next question`;

// Always sync the global default system prompt on startup
await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO UPDATE SET value = EXCLUDED.value",
  ["system_prompt", DEFAULT_PROMPT]
);

export { run, get, all, pool };
export default { run, get, all, pool };
