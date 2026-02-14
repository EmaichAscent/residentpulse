/**
 * Create a superadmin account
 *
 * Usage: node create-superadmin.js <email> <password>
 * Example: node create-superadmin.js admin@example.com MySecurePassword123
 */

import "dotenv/config";
import { hashPassword } from "./utils/password.js";
import { pool } from "./db.js";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node create-superadmin.js <email> <password>");
  console.error("Example: node create-superadmin.js admin@example.com MySecurePassword123");
  process.exit(1);
}

if (!email.includes("@")) {
  console.error("Invalid email address");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

async function createSuperAdmin() {
  try {
    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      "INSERT INTO admins (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role",
      [email.toLowerCase().trim(), passwordHash, "superadmin"]
    );

    console.log("✅ Superadmin created successfully!");
    console.log("Email:", result.rows[0].email);
    console.log("Role:", result.rows[0].role);
    console.log("\nYou can now login at /superadmin/login");

  } catch (err) {
    if (err.code === "23505") {
      console.error("❌ Error: A user with this email already exists");
    } else {
      console.error("❌ Error creating superadmin:", err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createSuperAdmin();
