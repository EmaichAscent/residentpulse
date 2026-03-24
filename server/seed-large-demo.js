/**
 * Large demo dataset seed script
 * Creates 100+ communities, 15+ managers, 500+ members, 3 completed rounds
 * Run: railway run -- node server/seed-large-demo.js
 */

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Run with: railway run -- node server/seed-large-demo.js");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- Data generators ---

const COMMUNITY_PREFIXES = [
  "Sunset", "Harbor", "Palm", "Eagle", "Silver", "Golden", "Crystal", "Royal",
  "Grand", "Lakeside", "Oceanview", "Emerald", "Diamond", "Sapphire", "Coral",
  "Magnolia", "Cypress", "Willow", "Cedar", "Maple", "Oak", "Pine", "Birch",
  "Aspen", "Ivy", "Laurel", "Holly", "Jasmine", "Rose", "Orchid", "Lily",
  "Vista", "Summit", "Ridge", "Valley", "Meadow", "Garden", "Park", "Grove",
  "Bayshore", "Riverwalk", "Stonegate", "Windmill", "Lighthouse", "Sandcastle",
  "Starlight", "Moonlight", "Sunstone", "Seabreeze", "Cloudview", "Skyline",
];

const COMMUNITY_SUFFIXES = [
  "Estates", "Villas", "Gardens", "Towers", "Place", "Commons", "Court",
  "Landing", "Pointe", "Crossing", "Reserve", "Ridge", "Heights", "Terrace",
  "Manor", "Park", "Village", "Square", "Green", "Cove",
];

const PROPERTY_TYPES = ["Condo", "Townhome", "Single Family", "HOA", "Co-op"];

const MANAGER_FIRST = [
  "Jennifer", "Michael", "Sarah", "David", "Amanda", "Robert", "Lisa", "James",
  "Michelle", "Daniel", "Patricia", "Christopher", "Angela", "Thomas", "Rachel",
  "Steven", "Karen", "Brian", "Nicole", "Kevin",
];

const MANAGER_LAST = [
  "Thompson", "Rodriguez", "Martinez", "Anderson", "Williams", "Johnson", "Garcia",
  "Brown", "Davis", "Wilson", "Miller", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Harris", "Clark", "Lewis", "Robinson",
];

const FIRST_NAMES = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "David", "Barbara", "William", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Lisa", "Daniel", "Nancy",
  "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
  "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna",
  "Kenneth", "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa",
  "Timothy", "Deborah", "Ronald", "Stephanie", "Edward", "Rebecca", "Jason", "Sharon",
  "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
  "Nicholas", "Angela", "Eric", "Shirley", "Jonathan", "Anna", "Stephen", "Brenda",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz",
];

const LOCATIONS = [
  { name: "Tampa Bay Office", url: "https://g.page/r/example-tampa/review" },
  { name: "Orlando Office", url: "https://g.page/r/example-orlando/review" },
  { name: "Miami Office", url: "https://g.page/r/example-miami/review" },
  { name: "Jacksonville Office", url: "https://g.page/r/example-jax/review" },
  { name: "Ft. Lauderdale Office", url: null },
];

// Realistic survey response summaries by NPS tier
const PROMOTER_SUMMARIES = [
  "Board member expressed strong satisfaction with management responsiveness and communication. Particularly praised the quick turnaround on maintenance requests and the monthly financial reports. Feels the management company genuinely cares about the community's wellbeing.",
  "Very positive about the recent landscaping improvements and the new vendor management process. Appreciates the transparency in budgeting decisions. Mentioned that communication has improved significantly since the last survey.",
  "Highly satisfied with the community manager's proactive approach. Praised the quarterly town hall meetings and the online portal for submitting requests. Feels the association is well-run and financially stable.",
  "Excellent feedback across the board. Board member highlighted the quick response to emergency plumbing issues and the smooth transition to a new insurance provider. Appreciates the detailed financial reporting.",
  "Strong promoter who values the management team's expertise in handling difficult homeowner disputes. Praised the new community newsletter and the organized annual meeting. Feels property values are being protected.",
  "Board member praised the management company for being responsive, organized, and transparent. Particularly happy with how the recent reserve study was handled and communicated to homeowners.",
  "Very satisfied with the overall management approach. Highlighted the efficiency of the work order system and the quality of vendor relationships. Mentioned the manager goes above and beyond regularly.",
  "Praised the community manager by name for their dedication. Feels communication is excellent, financial management is strong, and maintenance issues are addressed promptly. Would recommend to other communities.",
];

const PASSIVE_SUMMARIES = [
  "Board member is generally satisfied but noted room for improvement in communication timeliness. Maintenance requests sometimes take longer than expected. Appreciates the financial management but would like more frequent updates.",
  "Mixed feelings overall. Likes the management team personally but feels some processes are outdated. Suggested implementing a mobile app for easier communication. Financial reporting is good but could be more visual.",
  "Adequate service but not exceptional. Board member mentioned that while major issues are handled well, smaller maintenance items sometimes fall through the cracks. Would like to see more proactive communication.",
  "Satisfied with most aspects but concerned about rising costs. Feels the management fee is fair but would like to see more cost-saving initiatives. Communication is decent but inconsistent.",
  "Board member appreciates the stability of having the same manager but feels innovation is lacking. Suggested modernizing the community website and improving the vendor bidding process.",
  "Generally positive but flagged slow follow-up on some maintenance requests. Financial management is solid. Would like more transparency on how vendor contracts are negotiated.",
];

const DETRACTOR_SUMMARIES = [
  "Board member expressed frustration with repeated communication gaps. Maintenance requests submitted weeks ago remain unresolved. Feels the management company is spread too thin and not giving their community enough attention.",
  "Significant concerns about financial management. Board member feels budget allocations are unclear and reserve fund planning is inadequate. Has considered recommending the board explore other management options.",
  "Very dissatisfied with the current management approach. Multiple complaints about unresponsive staff, missed deadlines on maintenance projects, and lack of transparency in financial reporting. Wants immediate improvement.",
  "Board member is unhappy with the turnover of community managers. Third manager in two years. Feels there is no continuity and each new manager has to re-learn the community's needs. Considering switching companies.",
  "Frustrated with the landscaping vendor and feels the management company isn't holding them accountable. Also mentioned slow response to emergency maintenance calls and difficulty reaching anyone after hours.",
  "Board member raised concerns about the annual budget process being rushed. Feels the management company doesn't seek enough board input before making decisions. Communication needs significant improvement.",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randNPS(tier) {
  if (tier === "promoter") return randInt(9, 10);
  if (tier === "passive") return randInt(7, 8);
  return randInt(1, 6);
}

async function seed() {
  const client = await pool.connect();

  try {
    // Find the client
    const clientResult = await client.query(
      `SELECT c.id FROM clients c JOIN admin_users a ON a.client_id = c.id WHERE a.email = 'mikehardy73@gmail.com'`
    );
    if (clientResult.rows.length === 0) {
      console.error("Client not found for mikehardy73@gmail.com");
      process.exit(1);
    }
    const clientId = clientResult.rows[0].id;
    console.log(`Found client ID: ${clientId}`);

    // Clean existing demo data (keep admin user, client, and subscription)
    console.log("Cleaning existing data...");
    await client.query("DELETE FROM critical_alerts WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1)", [clientId]);
    await client.query("DELETE FROM sessions WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM invitation_logs WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM round_community_snapshots WHERE round_id IN (SELECT id FROM survey_rounds WHERE client_id = $1)", [clientId]);
    await client.query("DELETE FROM survey_rounds WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM users WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM communities WHERE client_id = $1", [clientId]);
    await client.query("DELETE FROM locations WHERE client_id = $1", [clientId]);
    console.log("Cleaned.");

    // Create locations
    console.log("Creating locations...");
    const locationIds = [];
    for (const loc of LOCATIONS) {
      const res = await client.query(
        "INSERT INTO locations (client_id, name, google_review_url) VALUES ($1, $2, $3) RETURNING id",
        [clientId, loc.name, loc.url]
      );
      locationIds.push(res.rows[0].id);
    }

    // Create managers
    const managers = [];
    for (let i = 0; i < 18; i++) {
      managers.push(`${MANAGER_FIRST[i % MANAGER_FIRST.length]} ${MANAGER_LAST[i % MANAGER_LAST.length]}`);
    }

    // Create 110 communities
    console.log("Creating 110 communities...");
    const communityIds = [];
    const communityNames = new Set();
    let managerIdx = 0;

    for (let i = 0; i < 110; i++) {
      let name;
      do {
        name = `${pick(COMMUNITY_PREFIXES)} ${pick(COMMUNITY_SUFFIXES)}`;
      } while (communityNames.has(name));
      communityNames.add(name);

      const locationId = locationIds[i % locationIds.length];
      const manager = managers[managerIdx % managers.length];
      const contractValue = randInt(8000, 35000);
      const units = randInt(20, 300);
      const propertyType = pick(PROPERTY_TYPES);
      const renewalDate = new Date(2026, randInt(3, 11), randInt(1, 28)).toISOString().split("T")[0];

      const res = await client.query(
        `INSERT INTO communities (client_id, community_name, location_id, contract_value, community_manager_name, units, property_type, renewal_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
        [clientId, name, locationId, contractValue, manager, units, propertyType, renewalDate]
      );
      communityIds.push({ id: res.rows[0].id, name, manager, contractValue, units, propertyType });

      // Rotate managers: 8-12 communities per manager
      if ((i + 1) % randInt(8, 12) === 0) managerIdx++;
    }
    console.log(`Created ${communityIds.length} communities with ${managers.length} managers`);

    // Create 5 board members per community
    console.log("Creating board members...");
    const allMembers = [];
    const usedEmails = new Set();
    let memberCount = 0;

    for (const comm of communityIds) {
      for (let m = 0; m < 5; m++) {
        const firstName = pick(FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        let email;
        do {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}@demo.residentpulse.local`;
        } while (usedEmails.has(email));
        usedEmails.add(email);

        const res = await client.query(
          `INSERT INTO users (client_id, first_name, last_name, email, community_name, community_id, active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
          [clientId, firstName, lastName, email, comm.name, comm.id]
        );
        allMembers.push({ id: res.rows[0].id, email, firstName, lastName, communityId: comm.id, communityName: comm.name });
        memberCount++;
      }
    }
    console.log(`Created ${memberCount} board members`);

    // Create 3 completed survey rounds
    console.log("Creating 3 survey rounds...");
    const rounds = [];
    for (let r = 1; r <= 3; r++) {
      const launchedAt = new Date(2025, 5 + (r * 3), 1); // Jun 2025, Sep 2025, Dec 2025
      const closesAt = new Date(launchedAt);
      closesAt.setDate(closesAt.getDate() + 30);
      const concludedAt = new Date(closesAt);
      concludedAt.setDate(concludedAt.getDate() + 1);

      const res = await client.query(
        `INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date, launched_at, closes_at, concluded_at, members_invited)
         VALUES ($1, $2, 'concluded', $3, $4, $5, $6, $7) RETURNING id`,
        [clientId, r, launchedAt.toISOString(), launchedAt.toISOString(), closesAt.toISOString(), concludedAt.toISOString(), memberCount]
      );
      rounds.push({ id: res.rows[0].id, number: r, launchedAt, closesAt });
    }

    // Create community snapshots for each round
    for (const round of rounds) {
      for (const comm of communityIds) {
        await client.query(
          `INSERT INTO round_community_snapshots (round_id, community_id, community_name, contract_value, community_manager_name, units, property_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
          [round.id, comm.id, comm.name, comm.contractValue, comm.manager, comm.units, comm.propertyType]
        );
      }
    }
    console.log("Created round snapshots");

    // Create sessions with NPS scores and summaries for each round
    console.log("Creating survey sessions (this takes a minute)...");
    let sessionCount = 0;

    for (const round of rounds) {
      // 70-85% response rate per round
      const responseRate = 0.7 + Math.random() * 0.15;
      const respondents = allMembers.filter(() => Math.random() < responseRate);

      for (const member of respondents) {
        // NPS distribution: ~30% promoters, ~40% passives, ~30% detractors
        // Shift slightly positive in later rounds to show improvement
        const promoterChance = 0.25 + (round.number * 0.05);
        const detractorChance = 0.35 - (round.number * 0.05);
        const roll = Math.random();
        let tier, summary;
        if (roll < promoterChance) {
          tier = "promoter";
          summary = pick(PROMOTER_SUMMARIES);
        } else if (roll < promoterChance + (1 - promoterChance - detractorChance)) {
          tier = "passive";
          summary = pick(PASSIVE_SUMMARIES);
        } else {
          tier = "detractor";
          summary = pick(DETRACTOR_SUMMARIES);
        }

        const npsScore = randNPS(tier);
        const sessionDate = new Date(round.launchedAt);
        sessionDate.setDate(sessionDate.getDate() + randInt(1, 25));

        const sessionRes = await client.query(
          `INSERT INTO sessions (client_id, email, user_id, round_id, community_id, community_name, nps_score, completed, summary, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $9) RETURNING id`,
          [clientId, member.email, member.id, round.id, member.communityId, member.communityName, npsScore, summary, sessionDate.toISOString()]
        );
        const sessionId = sessionRes.rows[0].id;

        // Create a few messages per session (user + assistant)
        const messages = [
          { role: "user", content: `I'd give it a ${npsScore} out of 10.` },
          { role: "assistant", content: `Thank you for sharing that. Can you tell me more about what's driving that score?` },
          { role: "user", content: summary.split(".").slice(0, 2).join(".") + "." },
          { role: "assistant", content: "I appreciate you sharing that feedback. Is there anything else you'd like to mention?" },
          { role: "user", content: "No, I think that covers it." },
        ];

        for (const msg of messages) {
          await client.query(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES ($1, $2, $3, $4)",
            [sessionId, msg.role, msg.content, sessionDate.toISOString()]
          );
        }

        // Create invitation log
        await client.query(
          `INSERT INTO invitation_logs (round_id, user_id, client_id, sent_at, invitation_method, email_status, delivery_status)
           VALUES ($1, $2, $3, $4, 1, 'sent', 'delivered')`,
          [round.id, member.id, clientId, round.launchedAt.toISOString()]
        );

        // Create critical alerts for low NPS detractors
        if (npsScore <= 3) {
          await client.query(
            `INSERT INTO critical_alerts (client_id, round_id, session_id, user_id, alert_type, severity, description, dismissed)
             VALUES ($1, $2, $3, $4, 'low_nps', 'critical', $5, FALSE)`,
            [clientId, round.id, sessionId, member.id, `Board member scored ${npsScore}/10. ${summary.split(".")[0]}.`]
          );
        }

        sessionCount++;
        if (sessionCount % 100 === 0) process.stdout.write(`  ${sessionCount} sessions...\r`);
      }
    }
    console.log(`\nCreated ${sessionCount} completed sessions across 3 rounds`);

    // Create 2 planned future rounds
    const cadenceResult = await client.query(
      "SELECT survey_cadence FROM client_subscriptions WHERE client_id = $1 AND status = 'active'",
      [clientId]
    );
    const cadence = cadenceResult.rows[0]?.survey_cadence || 4;
    for (let i = 0; i < cadence; i++) {
      const futureDate = new Date(2026, 3 + (i * 3), 1);
      await client.query(
        "INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date) VALUES ($1, $2, 'planned', $3)",
        [clientId, 4 + i, futureDate.toISOString()]
      );
    }
    console.log(`Created ${cadence} planned future rounds`);

    console.log("\n--- SEED COMPLETE ---");
    console.log(`Communities: ${communityIds.length}`);
    console.log(`Managers: ${managers.length}`);
    console.log(`Locations: ${LOCATIONS.length}`);
    console.log(`Board Members: ${memberCount}`);
    console.log(`Completed Rounds: 3`);
    console.log(`Sessions: ${sessionCount}`);
    console.log(`Messages: ${sessionCount * 5}`);
    console.log("\nLog in and check the dashboard!");

  } catch (err) {
    console.error("Seed failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
