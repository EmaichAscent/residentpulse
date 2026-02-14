import db from "../db.js";
import { hashPassword } from "../utils/password.js";

console.log("🔧 Running address fields and client admin fix...\n");

// Step 1: Add new address columns to clients table
console.log("📋 Adding address columns to clients table...");

const columnsToAdd = [
  "address_line1 TEXT",
  "address_line2 TEXT",
  "city TEXT",
  "state TEXT",
  "zip TEXT"
];

for (const col of columnsToAdd) {
  try {
    db.run(`ALTER TABLE clients ADD COLUMN ${col}`);
    console.log(`✓ Added column: ${col.split(' ')[0]}`);
  } catch (err) {
    if (err.message.includes("duplicate column")) {
      console.log(`✓ Column ${col.split(' ')[0]} already exists`);
    } else {
      throw err;
    }
  }
}

// Step 2: Create default client admin for CAM Ascent
console.log("\n👤 Creating default client admin for CAM Ascent...");

const camAscent = db.get("SELECT id FROM clients WHERE company_name = 'CAM Ascent'");

if (!camAscent) {
  console.log("❌ CAM Ascent client not found. Run multi-tenant migration first.");
  process.exit(1);
}

const existingAdmin = db.get(
  "SELECT id FROM client_admins WHERE client_id = ? LIMIT 1",
  [camAscent.id]
);

if (existingAdmin) {
  console.log(`✓ Client admin already exists for CAM Ascent (ID: ${existingAdmin.id})`);
} else {
  const tempPassword = "TempPass123!@#";
  const passwordHash = await hashPassword(tempPassword);

  db.run(
    "INSERT INTO client_admins (client_id, email, password_hash) VALUES (?, ?, ?)",
    [camAscent.id, "admin@camascent.com", passwordHash]
  );

  console.log("✓ Created default client admin");
  console.log("  Email: admin@camascent.com");
  console.log("  Password: TempPass123!@#");
}

console.log("\n✅ Migration complete!\n");

process.exit(0);
