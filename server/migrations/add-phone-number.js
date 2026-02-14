import db from "../db.js";

console.log("🔧 Adding phone number field to clients table...\n");

try {
  db.run("ALTER TABLE clients ADD COLUMN phone_number TEXT");
  console.log("✓ Added phone_number column to clients table");
} catch (err) {
  if (err.message.includes("duplicate column")) {
    console.log("✓ Column phone_number already exists");
  } else {
    throw err;
  }
}

console.log("\n✅ Migration complete!\n");

process.exit(0);
