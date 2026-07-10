import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./utils/logger.js";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Test connection
pool.on("connect", () => {
  logger.info("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected database error");
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
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'pending')),
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

    // Add first_name/last_name to client_admins
    await client.query(`ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS first_name TEXT`);
    await client.query(`ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS last_name TEXT`);

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

    // Create prompt_versions table (version history for editable system prompts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id SERIAL PRIMARY KEY,
        prompt_text TEXT NOT NULL,
        label TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Phase 2 PR2: extend versioning to all four prompts (board interview,
    // client onboarding, re-interview, supplement generator). Existing rows
    // default to 'system_prompt' since that was the only prompt versioned
    // before this migration.
    await client.query(`
      ALTER TABLE prompt_versions
      ADD COLUMN IF NOT EXISTS prompt_key TEXT NOT NULL DEFAULT 'system_prompt'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_prompt_versions_key_created
      ON prompt_versions (prompt_key, created_at DESC)
    `);

    // SuperAdmin PR 2: extend prompt_versions for the new structured-
    // block editor — adds blocks_jsonb (authoritative when present),
    // note (per-version commit message), version_number (explicit
    // version label, auto-incremented in app layer). Idempotent ALTER.
    try {
      const blocksMigrationPath = join(__dirname, "migrations", "add-prompt-versions-blocks.sql");
      const blocksMigrationSQL = readFileSync(blocksMigrationPath, "utf-8");
      await client.query(blocksMigrationSQL);
      logger.info("Prompt versions blocks migration applied successfully");
    } catch (migrationErr) {
      logger.info("Prompt versions blocks migration skipped (already applied or file not found)");
    }

    // Phase 3 PR2: Actions — what the management company is doing about
    // org-wide patterns surfaced by the AI. Per-client; tied to a theme name
    // (free text for now). Receipts (sentiment delta after the next round)
    // are computed at read-time from sessions, no extra columns needed yet.
    await client.query(`
      CREATE TABLE IF NOT EXISTS actions (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        theme TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT,
        owner_email TEXT,
        status TEXT NOT NULL DEFAULT 'in_progress',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_actions_client_created
      ON actions (client_id, created_at DESC)
    `);

    // action_updates — append-only progress log for an action. Each
    // row is a status note left by the owner or another admin while
    // the action is in flight. Replaces the original "details is the
    // single latest note" model with a real history. The first row
    // for any action is the note typed at acceptance time; subsequent
    // rows are added via the "Add update" flow on the State B card.
    //
    // created_by_email is intentionally a free string (mirrors the
    // owner_email convention) — the user list is on the Account page,
    // not a foreign key here.
    await client.query(`
      CREATE TABLE IF NOT EXISTS action_updates (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by_email TEXT
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_action_updates_action_created
      ON action_updates (action_id, created_at DESC)
    `);

    // One-time backfill: actions logged before action_updates existed
    // carry their initial note in actions.details. Seed those into
    // action_updates so the State B card has something to show.
    // Idempotent — only seeds for actions with details AND no updates.
    await client.query(`
      INSERT INTO action_updates (client_id, action_id, body, created_at, created_by_email)
      SELECT a.client_id, a.id, a.details, a.created_at, a.owner_email
        FROM actions a
        LEFT JOIN action_updates u ON u.action_id = a.id
       WHERE a.details IS NOT NULL
         AND TRIM(a.details) <> ''
         AND u.id IS NULL
    `);

    // recommendation_decisions — per-pick accept/reject state for
    // AI-generated recommended_actions on a round. Decoupled from
    // the actions table so we can track rejections (which never
    // become an action record) without polluting the action journal.
    //
    // Matching: same convention as actions.theme — the recommendation
    // text serves as the natural key alongside round_id. Unique
    // (round_id, theme) so a user can't accept and reject the same
    // pick simultaneously; updates flip the decision.
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendation_decisions (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        round_id INTEGER NOT NULL REFERENCES survey_rounds(id) ON DELETE CASCADE,
        theme TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
        decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_by TEXT,
        UNIQUE (round_id, theme)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rec_decisions_round
      ON recommendation_decisions (round_id)
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
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`
    );

    // community_count_estimate — collected on signup so we can size the
    // workspace and (eventually) recommend the right plan tier. Stored
    // as a free-text bucket label (e.g. "1-10", "10-50", "80-100",
    // "250+") rather than an integer because the user is estimating.
    await client.query(
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS community_count_estimate TEXT`
    );

    // Add password reset columns to client_admins
    await client.query(
      `ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS password_reset_token TEXT`
    );
    await client.query(
      `ALTER TABLE client_admins ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP`
    );

    // Add password reset columns to admins (superadmin)
    await client.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_reset_token TEXT`);
    await client.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP`
    );

    // Create indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id)`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id)`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_client_admins_client_id ON client_admins(client_id)`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_settings_client_id ON settings(client_id)`);

    // Run email invitations migration
    try {
      const migrationPath = join(__dirname, "migrations", "add-email-invitations.sql");
      const migrationSQL = readFileSync(migrationPath, "utf-8");
      await client.query(migrationSQL);
      logger.info("Email invitations migration applied successfully");
    } catch (migrationErr) {
      // Migration may have already been applied, or file may not exist yet
      logger.info("Email invitations migration skipped (already applied or file not found)");
    }

    // Run subscriptions and signup migration
    try {
      const subMigrationPath = join(__dirname, "migrations", "add-subscriptions-and-signup.sql");
      const subMigrationSQL = readFileSync(subMigrationPath, "utf-8");
      await client.query(subMigrationSQL);
      logger.info("Subscriptions and signup migration applied successfully");
    } catch (migrationErr) {
      logger.info("Subscriptions and signup migration skipped (already applied or file not found)");
    }

    // Run survey rounds migration
    try {
      const roundsMigrationPath = join(__dirname, "migrations", "add-survey-rounds.sql");
      const roundsMigrationSQL = readFileSync(roundsMigrationPath, "utf-8");
      await client.query(roundsMigrationSQL);
      logger.info("Survey rounds migration applied successfully");
    } catch (migrationErr) {
      logger.info("Survey rounds migration skipped (already applied or file not found)");
    }

    // Run per-round window_days migration (configurable response window)
    try {
      const windowMigrationPath = join(__dirname, "migrations", "add-survey-round-window-days.sql");
      const windowMigrationSQL = readFileSync(windowMigrationPath, "utf-8");
      await client.query(windowMigrationSQL);
      logger.info("Survey round window_days migration applied successfully");
    } catch (migrationErr) {
      logger.info("Survey round window_days migration skipped (already applied or file not found)");
    }

    // Create email_jobs table (depends on survey_rounds existing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_jobs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        round_id INTEGER REFERENCES survey_rounds(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'failed')),
        total_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run admin interviews migration
    try {
      const interviewMigrationPath = join(__dirname, "migrations", "add-admin-interviews.sql");
      const interviewMigrationSQL = readFileSync(interviewMigrationPath, "utf-8");
      await client.query(interviewMigrationSQL);
      logger.info("Admin interviews migration applied successfully");
    } catch (migrationErr) {
      logger.info("Admin interviews migration skipped (already applied or file not found)");
    }

    // Run dashboard redesign migration (insights + critical alerts)
    try {
      const dashboardMigrationPath = join(__dirname, "migrations", "add-dashboard-redesign.sql");
      const dashboardMigrationSQL = readFileSync(dashboardMigrationPath, "utf-8");
      await client.query(dashboardMigrationSQL);
      logger.info("Dashboard redesign migration applied successfully");
    } catch (migrationErr) {
      logger.info("Dashboard redesign migration skipped (already applied or file not found)");
    }

    // Run communities migration (paid-tier community data)
    try {
      const communitiesMigrationPath = join(__dirname, "migrations", "add-communities.sql");
      const communitiesMigrationSQL = readFileSync(communitiesMigrationPath, "utf-8");
      await client.query(communitiesMigrationSQL);
      logger.info("Communities migration applied successfully");
    } catch (migrationErr) {
      logger.info("Communities migration skipped (already applied or file not found)");
    }

    // Run session community_id migration (stable community reference on sessions)
    try {
      const sessionCommunityPath = join(__dirname, "migrations", "add-session-community-id.sql");
      const sessionCommunitySQL = readFileSync(sessionCommunityPath, "utf-8");
      await client.query(sessionCommunitySQL);
      logger.info("Session community_id migration applied successfully");
    } catch (migrationErr) {
      logger.info("Session community_id migration skipped (already applied or file not found)");
    }

    // Run alert solved state migration
    try {
      const alertSolvedPath = join(__dirname, "migrations", "add-alert-solved.sql");
      const alertSolvedSQL = readFileSync(alertSolvedPath, "utf-8");
      await client.query(alertSolvedSQL);
      logger.info("Alert solved migration applied successfully");
    } catch (migrationErr) {
      logger.info("Alert solved migration skipped (already applied or file not found)");
    }

    // Run email tracking migration (Resend webhook delivery status)
    try {
      const emailTrackingPath = join(__dirname, "migrations", "add-email-tracking.sql");
      const emailTrackingSQL = readFileSync(emailTrackingPath, "utf-8");
      await client.query(emailTrackingSQL);
      logger.info("Email tracking migration applied successfully");
    } catch (migrationErr) {
      logger.info("Email tracking migration skipped (already applied or file not found)");
    }

    // Run community deactivation + snapshots migration
    try {
      const deactivationPath = join(
        __dirname,
        "migrations",
        "add-community-deactivation-and-snapshots.sql"
      );
      const deactivationSQL = readFileSync(deactivationPath, "utf-8");
      await client.query(deactivationSQL);
      logger.info("Community deactivation and snapshots migration applied successfully");
    } catch (migrationErr) {
      logger.info(
        "Community deactivation and snapshots migration skipped (already applied or file not found)"
      );
    }

    // Run round approaching reminders migration
    try {
      const roundRemindersPath = join(
        __dirname,
        "migrations",
        "add-round-approaching-reminders.sql"
      );
      const roundRemindersSQL = readFileSync(roundRemindersPath, "utf-8");
      await client.query(roundRemindersSQL);
      logger.info("Round approaching reminders migration applied successfully");
    } catch (migrationErr) {
      logger.info(
        "Round approaching reminders migration skipped (already applied or file not found)"
      );
    }

    // Run client logo migration
    try {
      const logoPath = join(__dirname, "migrations", "add-client-logo.sql");
      const logoSQL = readFileSync(logoPath, "utf-8");
      await client.query(logoSQL);
      logger.info("Client logo migration applied successfully");
    } catch (migrationErr) {
      logger.info("Client logo migration skipped (already applied or file not found)");
    }

    // Run Zoho billing migration
    try {
      const zohoBillingPath = join(__dirname, "migrations", "add-zoho-billing.sql");
      const zohoBillingSQL = readFileSync(zohoBillingPath, "utf-8");
      await client.query(zohoBillingSQL);
      logger.info("Zoho billing migration applied successfully");
    } catch (migrationErr) {
      logger.info("Zoho billing migration skipped (already applied or file not found)");
    }

    // Run subscription management migration
    try {
      const subMgmtPath = join(__dirname, "migrations", "add-subscription-management.sql");
      const subMgmtSQL = readFileSync(subMgmtPath, "utf-8");
      await client.query(subMgmtSQL);
      logger.info("Subscription management migration applied successfully");
    } catch (migrationErr) {
      logger.info("Subscription management migration skipped (already applied or file not found)");
    }

    // Run performance indexes migration
    try {
      const indexPath = join(__dirname, "migrations", "add-performance-indexes.sql");
      const indexSQL = readFileSync(indexPath, "utf-8");
      await client.query(indexSQL);
      logger.info("Performance indexes migration applied successfully");
    } catch (migrationErr) {
      logger.info("Performance indexes migration skipped (already applied or file not found)");
    }

    // Run mock sessions migration (SuperAdmin test surveys)
    try {
      const mockSessionsPath = join(__dirname, "migrations", "add-mock-sessions.sql");
      const mockSessionsSQL = readFileSync(mockSessionsPath, "utf-8");
      await client.query(mockSessionsSQL);
      logger.info("Mock sessions migration applied successfully");
    } catch (migrationErr) {
      logger.info("Mock sessions migration skipped (already applied or file not found)");
    }

    // Run Google review migration (promoter review response tracking)
    try {
      const googleReviewPath = join(__dirname, "migrations", "add-google-review.sql");
      const googleReviewSQL = readFileSync(googleReviewPath, "utf-8");
      await client.query(googleReviewSQL);
      logger.info("Google review migration applied successfully");
    } catch (migrationErr) {
      logger.info("Google review migration skipped (already applied or file not found)");
    }

    // Run test mode (sandbox) migration
    try {
      const testModePath = join(__dirname, "migrations", "add-test-mode.sql");
      const testModeSQL = readFileSync(testModePath, "utf-8");
      await client.query(testModeSQL);
      logger.info("Test mode migration applied successfully");
    } catch (migrationErr) {
      logger.info("Test mode migration skipped (already applied or file not found)");
    }

    // Run locations migration (locations table + community location_id)
    try {
      const locationsPath = join(__dirname, "migrations", "add-locations.sql");
      const locationsSQL = readFileSync(locationsPath, "utf-8");
      await client.query(locationsSQL);
      logger.info("Locations migration applied successfully");
    } catch (migrationErr) {
      logger.info("Locations migration skipped (already applied or file not found)");
    }

    // Run scalability indexes migration
    try {
      const scalIndexPath = join(__dirname, "migrations", "add-scalability-indexes.sql");
      const scalIndexSQL = readFileSync(scalIndexPath, "utf-8");
      await client.query(scalIndexSQL);
      logger.info("Scalability indexes migration applied successfully");
    } catch (migrationErr) {
      logger.info("Scalability indexes migration skipped (already applied or file not found)");
    }

    // Run session close_phase migration (programmatic close-flow state)
    try {
      const closePhasePath = join(__dirname, "migrations", "add-session-close-phase.sql");
      const closePhaseSQL = readFileSync(closePhasePath, "utf-8");
      await client.query(closePhaseSQL);
      logger.info("Session close_phase migration applied successfully");
    } catch (_migrationErr) {
      logger.info("Session close_phase migration skipped (already applied or file not found)");
    }

    // Run Zoho-parity foundation migration (question catalog, templates,
    // survey_answers, managers/bookkeepers — see docs/ZOHO_PARITY_PLAN.md).
    // All-additive; carries no behavior until the builder + hybrid chat
    // runtime phases start writing to these tables.
    try {
      const zohoParityPath = join(__dirname, "migrations", "add-zoho-parity-foundation.sql");
      const zohoParitySQL = readFileSync(zohoParityPath, "utf-8");
      await client.query(zohoParitySQL);
      logger.info("Zoho-parity foundation migration applied successfully");
    } catch (_migrationErr) {
      logger.info("Zoho-parity foundation migration skipped (already applied or file not found)");
    }

    await client.query("COMMIT");
    logger.info("Database schema initialized successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Error initializing schema");
    throw err;
  } finally {
    client.release();
  }

  // Auto-create community records for any board member community_name not yet in communities table
  try {
    const result = await pool.query(`
      INSERT INTO communities (client_id, community_name)
      SELECT DISTINCT u.client_id, TRIM(u.community_name)
      FROM users u
      WHERE u.community_name IS NOT NULL AND TRIM(u.community_name) != ''
        AND NOT EXISTS (
          SELECT 1 FROM communities c
          WHERE c.client_id = u.client_id
            AND LOWER(TRIM(c.community_name)) = LOWER(TRIM(u.community_name))
        )
    `);
    if (result.rowCount > 0) {
      logger.info(`Auto-created ${result.rowCount} community records from board member data`);
    }
  } catch (syncErr) {
    // Silently skip if communities table doesn't exist yet
  }

  // Auto-link existing users to communities by matching community_name
  try {
    await pool.query(`
      UPDATE users u SET community_id = c.id
      FROM communities c
      WHERE u.client_id = c.client_id
        AND LOWER(TRIM(u.community_name)) = LOWER(TRIM(c.community_name))
        AND u.community_id IS NULL
    `);
  } catch (linkErr) {
    // Silently skip if communities table doesn't exist yet
  }
}

// Helper: run a statement and return changes info (for INSERT/UPDATE/DELETE)
async function run(sql, params = []) {
  const client = await pool.connect();
  try {
    // Convert ? placeholders to $1, $2, etc for PostgreSQL
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    // Only add RETURNING id for INSERT statements (avoids double-execution on UPDATE/DELETE)
    const isInsert = sql.trimStart().toUpperCase().startsWith("INSERT");
    const finalSql = isInsert ? pgSql + " RETURNING id" : pgSql;

    const result = await client.query(finalSql, params);
    return {
      lastInsertRowid: isInsert ? result.rows[0]?.id || null : null,
      changes: result.rowCount,
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

// Seed defaults (V2 — content lives in server/prompts/defaults.js).
// ON CONFLICT DO NOTHING means existing rows are not overwritten — to upgrade
// existing installs from V1 to V2, run server/migrations/2026-04-30-rewrite-system-prompts.js.
import {
  V2_SYSTEM_PROMPT,
  V2_INTERVIEW_INITIAL,
  V1_INTERVIEW_RE,
  V2_PROMPT_GENERATION,
} from "./prompts/defaults.js";

await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO NOTHING",
  ["system_prompt", V2_SYSTEM_PROMPT]
);
await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO NOTHING",
  ["interview_initial_prompt", V2_INTERVIEW_INITIAL]
);
await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO NOTHING",
  ["interview_re_prompt", V1_INTERVIEW_RE]
);
await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO NOTHING",
  ["prompt_generation_instruction", V2_PROMPT_GENERATION]
);

// AI provider toggle (Anthropic Claude vs xAI Grok). Defaults to
// "anthropic" so existing installs behave exactly as before. Operators
// flip this in SuperAdmin → Settings → AI provider when they want to
// A/B test Grok against Claude on the same prompts.
await run(
  "INSERT INTO settings (key, value, client_id) VALUES (?, ?, NULL) ON CONFLICT (key, client_id) DO NOTHING",
  ["ai_provider", "anthropic"]
);

export { run, get, all, pool };
export default { run, get, all, pool };
