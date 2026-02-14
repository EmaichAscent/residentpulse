import db from "../db.js";
import { hashPassword } from "../utils/password.js";

console.log("🚀 Starting multi-tenant migration...\n");

// Step 1: Create new tables
console.log("📋 Creating new tables...");

db.run(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    street_address TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✓ Created clients table");

db.run(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'superadmin' CHECK(role IN ('superadmin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✓ Created admins table");

db.run(`
  CREATE TABLE IF NOT EXISTS client_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✓ Created client_admins table\n");

// Step 2: Create default client "CAM Ascent"
console.log("🏢 Creating default client...");
const existingClient = db.get("SELECT id FROM clients WHERE company_name = 'CAM Ascent'");

let defaultClientId;
if (existingClient) {
  defaultClientId = existingClient.id;
  console.log(`✓ Default client already exists (ID: ${defaultClientId})\n`);
} else {
  const result = db.run(
    "INSERT INTO clients (company_name, status) VALUES (?, ?)",
    ["CAM Ascent", "active"]
  );
  defaultClientId = result.lastInsertRowid;
  console.log(`✓ Created default client: CAM Ascent (ID: ${defaultClientId})\n`);
}

// Step 3: Add client_id columns to existing tables
console.log("🔧 Adding client_id columns to existing tables...");

// Add client_id to sessions
try {
  db.run("ALTER TABLE sessions ADD COLUMN client_id INTEGER REFERENCES clients(id)");
  console.log("✓ Added client_id to sessions table");
} catch (err) {
  if (err.message.includes("duplicate column")) {
    console.log("✓ client_id already exists in sessions table");
  } else {
    throw err;
  }
}

// Add client_id to users
try {
  db.run("ALTER TABLE users ADD COLUMN client_id INTEGER REFERENCES clients(id)");
  console.log("✓ Added client_id to users table");
} catch (err) {
  if (err.message.includes("duplicate column")) {
    console.log("✓ client_id already exists in users table");
  } else {
    throw err;
  }
}

// For settings table, we need to handle this differently
// Check if client_id column exists
const settingsColumns = db.all("PRAGMA table_info(settings)");
const hasClientId = settingsColumns.some(col => col.name === "client_id");

if (!hasClientId) {
  db.run("ALTER TABLE settings ADD COLUMN client_id INTEGER REFERENCES clients(id)");
  console.log("✓ Added client_id to settings table");
} else {
  console.log("✓ client_id already exists in settings table");
}

console.log();

// Step 4: Populate client_id for existing data
console.log("📊 Populating client_id for existing data...");
db.run("UPDATE sessions SET client_id = ? WHERE client_id IS NULL", [defaultClientId]);
db.run("UPDATE users SET client_id = ? WHERE client_id IS NULL", [defaultClientId]);
db.run("UPDATE settings SET client_id = ? WHERE client_id IS NULL", [defaultClientId]);
console.log(`✓ Updated all existing records to client_id: ${defaultClientId}\n`);

// Step 5: Seed superadmin accounts
console.log("👤 Creating superadmin accounts...");

const superAdmins = [
  { email: "mike.hardy@camascent.com", password: "TempPass123!@#" },
  { email: "andrea.hardy@camascent.com", password: "TempPass123!@#" }
];

for (const admin of superAdmins) {
  const existing = db.get("SELECT id FROM admins WHERE email = ?", [admin.email]);

  if (existing) {
    console.log(`✓ SuperAdmin already exists: ${admin.email}`);
  } else {
    const passwordHash = await hashPassword(admin.password);
    db.run(
      "INSERT INTO admins (email, password_hash, role) VALUES (?, ?, ?)",
      [admin.email, passwordHash, "superadmin"]
    );
    console.log(`✓ Created superadmin: ${admin.email} (password: ${admin.password})`);
  }
}

console.log("\n✅ Migration complete!\n");
console.log("SuperAdmin Credentials:");
console.log("========================");
console.log("Email: mike.hardy@camascent.com");
console.log("Password: TempPass123!@#");
console.log();
console.log("Email: andrea.hardy@camascent.com");
console.log("Password: TempPass123!@#");
console.log();
console.log("⚠️  IMPORTANT: Change these passwords after first login!\n");

process.exit(0);
