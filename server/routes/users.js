import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import db from "../db.js";
import { requireClientAdmin } from "../middleware/auth.js";
import { sendInvitation } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Validate email — used by login page
router.get("/validate", async (req, res) => {
  const email = (req.query.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ valid: false, error: "Email is required" });

  const user = await db.get("SELECT id, first_name, client_id FROM users WHERE LOWER(email) = ?", [email]);
  if (!user) return res.json({ valid: false });

  res.json({ valid: true, user: { id: user.id, first_name: user.first_name, client_id: user.client_id } });
});

// List all users (admin) - filtered by client
router.get("/", requireClientAdmin, async (req, res) => {
  const users = await db.all(
    "SELECT * FROM users WHERE client_id = ? AND active = TRUE ORDER BY updated_at DESC",
    [req.clientId]
  );
  res.json(users);
});

// Import CSV (admin) - scoped to client
router.post("/import", requireClientAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const content = req.file.buffer.toString("utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const emailIdx = header.indexOf("email");
  const communityIdx = header.indexOf("community_name");
  const companyIdx = header.indexOf("management_company");
  const firstNameIdx = header.indexOf("first_name");
  const lastNameIdx = header.indexOf("last_name");

  if (emailIdx === -1) return res.status(400).json({ error: "CSV must have an 'email' column" });

  // Check member limit before import
  const subscription = await db.get(
    `SELECT sp.member_limit FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ? AND cs.status = 'active'`,
    [req.clientId]
  );
  const currentCount = await db.get("SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE", [req.clientId]);
  let remainingSlots = subscription ? subscription.member_limit - (currentCount?.count || 0) : Infinity;

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const email = (cols[emailIdx] || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      errors.push(`Row ${i + 1}: invalid or missing email`);
      continue;
    }

    const community = communityIdx >= 0 ? (cols[communityIdx] || "").trim() : "";
    const company = companyIdx >= 0 ? (cols[companyIdx] || "").trim() : "";
    const firstName = firstNameIdx >= 0 ? (cols[firstNameIdx] || "").trim() : "";
    const lastName = lastNameIdx >= 0 ? (cols[lastNameIdx] || "").trim() : "";

    const existing = await db.get("SELECT id, active FROM users WHERE LOWER(email) = ? AND client_id = ?", [email, req.clientId]);
    if (existing) {
      await db.run(
        "UPDATE users SET first_name = ?, last_name = ?, community_name = ?, management_company = ?, active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [firstName, lastName, community, company, existing.id]
      );
      updated++;
    } else {
      if (remainingSlots <= 0) {
        errors.push(`Row ${i + 1}: board member limit reached, skipped`);
        continue;
      }
      await db.run(
        "INSERT INTO users (first_name, last_name, email, community_name, management_company, client_id) VALUES (?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, community, company, req.clientId]
      );
      created++;
      remainingSlots--;
    }
  }

  res.json({ created, updated, errors, total: created + updated });
});

// Create single user (admin) - scoped to client
router.post("/", requireClientAdmin, async (req, res) => {
  const { email, first_name, last_name, community_name, management_company } = req.body;
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  // Check member limit
  const subscription = await db.get(
    `SELECT sp.member_limit FROM client_subscriptions cs
     JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.client_id = ? AND cs.status = 'active'`,
    [req.clientId]
  );
  if (subscription) {
    const currentCount = await db.get("SELECT COUNT(*) as count FROM users WHERE client_id = ? AND active = TRUE", [req.clientId]);
    if ((currentCount?.count || 0) >= subscription.member_limit) {
      return res.status(403).json({
        error: `Board member limit reached (${subscription.member_limit}). Please upgrade your plan to add more board members.`
      });
    }
  }

  // Check if email exists (including inactive — reactivate if so)
  const existing = await db.get("SELECT id, active FROM users WHERE LOWER(email) = ? AND client_id = ?", [trimmedEmail, req.clientId]);
  if (existing && existing.active) {
    return res.status(409).json({ error: "A user with this email already exists" });
  }

  if (existing && !existing.active) {
    await db.run(
      "UPDATE users SET active = TRUE, first_name = ?, last_name = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [(first_name || "").trim(), (last_name || "").trim(), (community_name || "").trim(), (management_company || "").trim(), existing.id]
    );
    const reactivated = await db.get("SELECT * FROM users WHERE id = ?", [existing.id]);
    return res.json(reactivated);
  }

  await db.run(
    "INSERT INTO users (first_name, last_name, email, community_name, management_company, client_id) VALUES (?, ?, ?, ?, ?, ?)",
    [
      (first_name || "").trim(),
      (last_name || "").trim(),
      trimmedEmail,
      (community_name || "").trim(),
      (management_company || "").trim(),
      req.clientId
    ]
  );
  const user = await db.get("SELECT * FROM users WHERE LOWER(email) = ? AND client_id = ?", [trimmedEmail, req.clientId]);
  res.json(user);
});

// Update user (admin) - scoped to client
router.put("/:id", requireClientAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM users WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { email, first_name, last_name, community_name, management_company } = req.body;
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  // Check for email conflict with another user in this client
  const conflict = await db.get("SELECT id FROM users WHERE LOWER(email) = ? AND id != ? AND client_id = ?", [trimmedEmail, id, req.clientId]);
  if (conflict) {
    return res.status(409).json({ error: "Another user with this email already exists" });
  }

  const oldEmail = existing.email?.toLowerCase();
  const emailChanged = oldEmail !== trimmedEmail;

  await db.run(
    "UPDATE users SET first_name = ?, last_name = ?, email = ?, community_name = ?, management_company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [
      (first_name || "").trim(),
      (last_name || "").trim(),
      trimmedEmail,
      (community_name || "").trim(),
      (management_company || "").trim(),
      id,
    ]
  );
  const updated = await db.get("SELECT * FROM users WHERE id = ?", [id]);

  // If email changed, check for an active round so we can prompt re-enrollment
  if (emailChanged) {
    const activeRound = await db.get(
      "SELECT id, round_number FROM survey_rounds WHERE client_id = ? AND status = 'in_progress' LIMIT 1",
      [req.clientId]
    );
    if (activeRound) {
      // Check if user already has an active session for this round
      const existingSession = await db.get(
        "SELECT id FROM sessions WHERE user_id = ? AND round_id = ? AND client_id = ?",
        [id, activeRound.id, req.clientId]
      );
      if (!existingSession) {
        return res.json({ ...updated, emailChanged: true, activeRound: { id: activeRound.id, round_number: activeRound.round_number } });
      }
    }
  }

  res.json(updated);
});

// Deactivate user (admin) - soft-delete, preserves historical survey data
router.delete("/:id", requireClientAdmin, async (req, res) => {
  const id = Number(req.params.id);

  // Verify user belongs to this client
  const user = await db.get("SELECT id FROM users WHERE id = ? AND client_id = ?", [id, req.clientId]);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  await db.run("UPDATE users SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Enroll a member in the active round (e.g. after email correction)
router.post("/:id/enroll", requireClientAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const member = await db.get("SELECT * FROM users WHERE id = ? AND client_id = ? AND active = TRUE", [id, req.clientId]);
  if (!member) return res.status(404).json({ error: "Member not found" });

  const activeRound = await db.get(
    "SELECT id, round_number, closes_at FROM survey_rounds WHERE client_id = ? AND status = 'in_progress' LIMIT 1",
    [req.clientId]
  );
  if (!activeRound) return res.status(400).json({ error: "No active round" });

  // Check not already invited for this round (allow resend if bounced/complained)
  const existingInvite = await db.get(
    "SELECT id, delivery_status FROM invitation_logs WHERE user_id = ? AND round_id = ? AND client_id = ? AND email_status = 'sent' ORDER BY sent_at DESC LIMIT 1",
    [id, activeRound.id, req.clientId]
  );
  const isResend = existingInvite && (existingInvite.delivery_status === "bounced" || existingInvite.delivery_status === "complained");
  if (existingInvite && !isResend) return res.status(409).json({ error: "Already enrolled in this round" });

  try {
    const token = crypto.randomUUID();
    const expiresAt = activeRound.closes_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db.run(
      "UPDATE users SET invitation_token = ?, invitation_token_expires = ?, last_invited_at = CURRENT_TIMESTAMP WHERE id = ?",
      [token, expiresAt, id]
    );

    // Get company name for email template
    const client = await db.get("SELECT company_name FROM clients WHERE id = ?", [req.clientId]);

    const emailResult = await sendInvitation(member, token, {
      closesAt: expiresAt,
      roundNumber: activeRound.round_number,
      companyName: client?.company_name || "",
      clientId: req.clientId,
    });

    await db.run(
      "INSERT INTO invitation_logs (user_id, client_id, sent_by, email_status, round_id, resend_email_id) VALUES (?, ?, ?, ?, ?, ?)",
      [id, req.clientId, req.userId, "sent", activeRound.id, emailResult?.id || null]
    );

    // Update members_invited count on the round (skip if resending to existing member)
    if (!isResend) {
      await db.run(
        "UPDATE survey_rounds SET members_invited = members_invited + 1 WHERE id = ?",
        [activeRound.id]
      );
    }

    await logActivity({
      actorType: "client_admin",
      actorId: req.userId,
      actorEmail: req.userEmail,
      action: "enroll_member",
      entityType: "user",
      entityId: id,
      clientId: req.clientId,
      metadata: { round_id: activeRound.id, round_number: activeRound.round_number, email: member.email }
    });

    res.json({ ok: true, round_number: activeRound.round_number });
  } catch (err) {
    console.error(`Failed to enroll member ${id}:`, err);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export default router;
