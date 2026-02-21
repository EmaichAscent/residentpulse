import cron from "node-cron";
import db from "./db.js";
import { sendReminder } from "./utils/emailService.js";
import { generateRoundInsights } from "./utils/insightGenerator.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Auto-conclude rounds that have passed their close date
 */
async function concludeExpiredRounds() {
  const expiredRounds = await db.all(
    "SELECT id, client_id, round_number FROM survey_rounds WHERE status = 'in_progress' AND closes_at <= CURRENT_TIMESTAMP"
  );

  for (const round of expiredRounds) {
    await db.run(
      "UPDATE survey_rounds SET status = 'concluded', concluded_at = CURRENT_TIMESTAMP WHERE id = ?",
      [round.id]
    );

    // Snapshot all client communities for historical dashboard data
    await db.run(
      `INSERT INTO round_community_snapshots
        (round_id, community_id, community_name, contract_value, community_manager_name,
         property_type, number_of_units, contract_renewal_date, contract_month_to_month, status)
       SELECT $1, c.id, c.community_name, c.contract_value, c.community_manager_name,
              c.property_type, c.number_of_units, c.contract_renewal_date, c.contract_month_to_month, c.status
       FROM communities c WHERE c.client_id = $2
       ON CONFLICT (round_id, community_id) DO NOTHING`,
      [round.id, round.client_id]
    );

    console.log(`Auto-concluded round ${round.round_number} for client ${round.client_id}`);

    // Generate AI insights asynchronously
    generateRoundInsights(round.id, round.client_id).catch((err) =>
      console.error(`Failed to generate insights for round ${round.id}:`, err.message)
    );
  }
}

/**
 * Send reminder emails to non-responders at day 10 and day 20
 */
async function sendReminders() {
  // Day 10 reminders
  const day10Rounds = await db.all(
    `SELECT * FROM survey_rounds
     WHERE status = 'in_progress'
       AND reminder_10_sent = false
       AND launched_at <= CURRENT_TIMESTAMP - INTERVAL '10 days'`
  );

  for (const round of day10Rounds) {
    await sendRoundReminders(round, 10);
    await db.run("UPDATE survey_rounds SET reminder_10_sent = true WHERE id = ?", [round.id]);
    console.log(`Day 10 reminders sent for round ${round.round_number} (client ${round.client_id})`);
  }

  // Day 20 reminders
  const day20Rounds = await db.all(
    `SELECT * FROM survey_rounds
     WHERE status = 'in_progress'
       AND reminder_20_sent = false
       AND launched_at <= CURRENT_TIMESTAMP - INTERVAL '20 days'`
  );

  for (const round of day20Rounds) {
    await sendRoundReminders(round, 20);
    await db.run("UPDATE survey_rounds SET reminder_20_sent = true WHERE id = ?", [round.id]);
    console.log(`Day 20 reminders sent for round ${round.round_number} (client ${round.client_id})`);
  }
}

/**
 * Send reminder emails to non-responders for a specific round
 */
async function sendRoundReminders(round, dayNumber) {
  // Get company name for email from field
  const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [round.client_id]);
  const companyName = client?.company_name || "your management company";

  // Find non-responders: users invited for this round who haven't completed a session
  // Excludes bounced/complained addresses to avoid sending to bad/hostile addresses
  const nonResponders = await db.all(
    `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
            COALESCE(c.community_name, u.community_name) as community_name,
            u.management_company, u.invitation_token
     FROM invitation_logs il
     JOIN users u ON u.id = il.user_id
     LEFT JOIN communities c ON c.id = u.community_id
     WHERE il.round_id = ? AND il.email_status = 'sent'
       AND (u.community_id IS NULL OR c.status = 'active')
       AND COALESCE(il.delivery_status, 'delivered') NOT IN ('bounced', 'complained')
       AND NOT EXISTS (
         SELECT 1 FROM sessions s
         WHERE s.round_id = ? AND s.user_id = u.id AND s.completed = true
       )`,
    [round.id, round.id]
  );

  const closesAt = new Date(round.closes_at);
  const now = new Date();
  const daysRemaining = Math.max(1, Math.ceil((closesAt - now) / (1000 * 60 * 60 * 24)));

  for (const user of nonResponders) {
    if (!user.invitation_token) continue;

    try {
      await sendReminder(user, user.invitation_token, { daysRemaining, companyName });
    } catch (err) {
      console.error(`Failed to send day ${dayNumber} reminder to ${user.email}:`, err.message);
    }

    // Rate limit
    if (user !== nonResponders[nonResponders.length - 1]) {
      await sleep(500);
    }
  }
}

/**
 * Start the scheduler - runs daily at 9:00 AM UTC
 */
export function startScheduler() {
  cron.schedule("0 9 * * *", async () => {
    console.log("Running daily survey round scheduler...");
    try {
      await concludeExpiredRounds();
      await sendReminders();
      console.log("Daily scheduler completed successfully");
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });

  console.log("Survey round scheduler started (daily at 9:00 AM UTC)");
}
