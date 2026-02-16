import db from "../db.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion

/**
 * Generate a unique 6-character alphanumeric client code.
 * Checks against existing codes to prevent duplicates.
 */
export async function generateClientCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }

    const existing = await db.get("SELECT id FROM clients WHERE client_code = ?", [code]);
    if (!existing) return code;
  }

  throw new Error("Failed to generate unique client code after 10 attempts");
}
