import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { hashPassword } from "../utils/password.js";
import { sendVerificationEmail } from "../utils/emailService.js";

const router = Router();

// Rate limiting for signup attempts
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per window
  message: { error: "Too many signup attempts, please try again later" }
});

// Get available subscription plans
router.get("/plans", async (req, res) => {
  try {
    const plans = await db.all(
      "SELECT id, name, display_name, member_limit, survey_rounds_per_year, price_cents FROM subscription_plans WHERE is_public = TRUE ORDER BY sort_order"
    );
    res.json(plans);
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// Register a new client
router.post("/register", signupLimiter, async (req, res) => {
  const {
    company_name, address_line1, address_line2, city, state, zip,
    phone_number, admin_email, password, plan_id
  } = req.body;

  // Validate required fields
  if (!company_name || !address_line1 || !city || !state || !zip || !phone_number || !admin_email || !password || !plan_id) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const email = admin_email.toLowerCase().trim();
  if (!email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  try {
    // Check if email already exists
    const existingAdmin = await db.get("SELECT id FROM client_admins WHERE email = ?", [email]);
    if (existingAdmin) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    // Verify plan exists and is public
    const plan = await db.get("SELECT id FROM subscription_plans WHERE id = ? AND is_public = TRUE", [plan_id]);
    if (!plan) {
      return res.status(400).json({ error: "Invalid subscription plan" });
    }

    // Create client with pending status
    const clientResult = await db.run(
      "INSERT INTO clients (company_name, address_line1, address_line2, city, state, zip, phone_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [company_name, address_line1, address_line2 || null, city, state, zip, phone_number, "pending"]
    );
    const clientId = clientResult.lastInsertRowid;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token (24-hour expiry)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create admin user
    await db.run(
      "INSERT INTO client_admins (client_id, email, password_hash, email_verified, email_verification_token, email_verification_expires) VALUES (?, ?, ?, ?, ?, ?)",
      [clientId, email, passwordHash, false, verificationToken, expires.toISOString()]
    );

    // Create subscription
    await db.run(
      "INSERT INTO client_subscriptions (client_id, plan_id, status) VALUES (?, ?, ?)",
      [clientId, plan_id, "active"]
    );

    // Copy global system prompt
    const globalPrompt = await db.get("SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL");
    if (globalPrompt) {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES ('system_prompt', ?, ?)",
        [globalPrompt.value, clientId]
      );
    }

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailErr) {
      // Log but don't fail — account is created, user can request resend
      console.error("Failed to send verification email:", emailErr.message);
      console.log(`Verification link: ${(process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "")}/admin/verify-email?token=${verificationToken}`);
    }

    res.json({ ok: true, message: "Check your email to verify your account." });
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// Verify email
router.get("/verify", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ ok: false, error: "No verification token provided." });
  }

  try {
    const admin = await db.get(
      "SELECT id, client_id FROM client_admins WHERE email_verification_token = ? AND email_verification_expires > NOW()",
      [token]
    );

    if (!admin) {
      return res.status(400).json({ ok: false, error: "This verification link has expired or is invalid." });
    }

    // Mark email as verified
    await db.run(
      "UPDATE client_admins SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?",
      [admin.id]
    );

    // Activate the client
    await db.run(
      "UPDATE clients SET status = 'active' WHERE id = ?",
      [admin.client_id]
    );

    res.json({ ok: true, message: "Email verified! You can now log in." });
  } catch (err) {
    console.error("Error verifying email:", err);
    res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
});

export default router;
