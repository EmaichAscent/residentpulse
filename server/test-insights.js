import db from "./db.js";

const ids = [16, 15, 14, 13, 12];
const placeholders = ids.map(() => "?").join(",");

console.log("Query:", `SELECT id, email, nps_score, summary, community_name, management_company FROM sessions WHERE id IN (${placeholders}) AND summary IS NOT NULL`);
console.log("IDs:", ids);

const sessions = db.all(
  `SELECT id, email, nps_score, summary, community_name, management_company
   FROM sessions
   WHERE id IN (${placeholders}) AND summary IS NOT NULL`,
  ...ids
);

console.log("\nFound sessions:", sessions.length);
console.log("Sessions:", JSON.stringify(sessions.map(s => ({
  id: s.id,
  email: s.email,
  has_summary: s.summary ? 'YES' : 'NO',
  summary_length: s.summary ? s.summary.length : 0
})), null, 2));
