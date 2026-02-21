import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { hashPassword } from "../utils/password.js";
import { sendVerificationEmail } from "../utils/emailService.js";
import { logActivity } from "../utils/activityLog.js";
import { generateClientCode } from "../utils/clientCode.js";
import { createCheckoutSession, isZohoConfigured } from "../utils/zohoService.js";

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
    phone_number, admin_first_name, admin_last_name, admin_email, password, plan_id
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
    const plan = await db.get("SELECT id, name, price_cents, zoho_plan_code FROM subscription_plans WHERE id = ? AND is_public = TRUE", [plan_id]);
    if (!plan) {
      return res.status(400).json({ error: "Invalid subscription plan" });
    }

    const isPaidPlan = plan.price_cents && plan.price_cents > 0;

    // Create client with pending status and unique code
    const clientCode = await generateClientCode();
    const clientResult = await db.run(
      "INSERT INTO clients (company_name, address_line1, address_line2, city, state, zip, phone_number, status, client_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [company_name, address_line1, address_line2 || null, city, state, zip, phone_number, "pending", clientCode]
    );
    const clientId = clientResult.lastInsertRowid;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token (24-hour expiry)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create admin user
    await db.run(
      "INSERT INTO client_admins (client_id, email, password_hash, email_verified, email_verification_token, email_verification_expires, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [clientId, email, passwordHash, false, verificationToken, expires.toISOString(), admin_first_name || null, admin_last_name || null]
    );

    // Create subscription
    await db.run(
      "INSERT INTO client_subscriptions (client_id, plan_id, status) VALUES (?, ?, ?)",
      [clientId, plan_id, isPaidPlan ? "pending_payment" : "active"]
    );

    // Copy global system prompt
    const globalPrompt = await db.get("SELECT value FROM settings WHERE key = 'system_prompt' AND client_id IS NULL");
    if (globalPrompt) {
      await db.run(
        "INSERT INTO settings (key, value, client_id) VALUES ('system_prompt', ?, ?)",
        [globalPrompt.value, clientId]
      );
    }

    if (isPaidPlan) {
      // Paid plan: redirect to Zoho checkout — verification email sent after payment webhook
      await logActivity({
        actorType: "client_admin",
        actorEmail: email,
        action: "signup_paid_checkout",
        entityType: "client",
        entityId: clientId,
        clientId,
        metadata: { plan_name: plan.name }
      });

      if (!isZohoConfigured()) {
        return res.status(502).json({
          error: "Payment system is not yet configured. Please contact us to complete your subscription setup."
        });
      }

      try {
        const baseUrl = (process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
        const checkoutResult = await createCheckoutSession({
          planCode: plan.zoho_plan_code,
          customerInfo: {
            display_name: company_name,
            email,
            first_name: admin_first_name || "",
            last_name: admin_last_name || "",
            phone: phone_number || "",
            company_name,
          },
          clientId,
          redirectUrl: `${baseUrl}/signup/payment-success`,
        });

        return res.json({
          ok: true,
          requires_payment: true,
          checkout_url: checkoutResult.url,
          message: "Redirecting to payment...",
        });
      } catch (zohoErr) {
        console.error("Zoho checkout creation failed:", zohoErr);
        return res.status(502).json({
          error: "Payment system is temporarily unavailable. Your account has been created. Please contact support to complete setup."
        });
      }
    }

    // Free plan: send verification email immediately
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailErr) {
      // Log but don't fail — account is created, user can request resend
      console.error("Failed to send verification email:", emailErr.message);
      console.log(`Verification link: ${(process.env.SURVEY_BASE_URL || "http://localhost:5173").replace(/\/$/, "")}/admin/verify-email?token=${verificationToken}`);
    }

    await logActivity({
      actorType: "client_admin",
      actorEmail: email,
      action: "signup",
      entityType: "client",
      entityId: clientId,
      clientId
    });

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

// Resend verification email
router.post("/resend-verification", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many requests, please try again later" }
}), async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const admin = await db.get(
      `SELECT ca.id, ca.email, ca.email_verified
       FROM client_admins ca
       JOIN clients c ON c.id = ca.client_id
       WHERE ca.email = ? AND c.status = 'pending'`,
      [email.toLowerCase().trim()]
    );

    if (!admin || admin.email_verified) {
      // Don't reveal whether account exists
      return res.json({ message: "If an unverified account exists with that email, a new verification link has been sent." });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.run(
      "UPDATE client_admins SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?",
      [verificationToken, expires.toISOString(), admin.id]
    );

    await sendVerificationEmail(admin.email, verificationToken);

    res.json({ message: "If an unverified account exists with that email, a new verification link has been sent." });
  } catch (err) {
    console.error("Error resending verification:", err);
    res.json({ message: "If an unverified account exists with that email, a new verification link has been sent." });
  }
});

export default router;
