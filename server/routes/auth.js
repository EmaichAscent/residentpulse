import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { sendPasswordResetEmail } from "../utils/emailService.js";

const router = Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: "Too many login attempts, please try again later" }
});

// Separate rate limiter for password reset (more generous)
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 reset requests per window
  message: { error: "Too many password reset requests, please try again later" }
});

// SuperAdmin login
router.post("/superadmin/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const admin = await db.get("SELECT * FROM admins WHERE email = ?", [email.toLowerCase().trim()]);

  if (!admin) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isValidPassword = await comparePassword(password, admin.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Create session
  req.session.user = {
    id: admin.id,
    email: admin.email,
    role: "superadmin"
  };

  res.json({
    user: {
      id: admin.id,
      email: admin.email,
      role: "superadmin"
    }
  });
});

// Client Admin login
router.post("/admin/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const admin = await db.get(
    `SELECT ca.*, c.status as client_status, c.company_name
     FROM client_admins ca
     JOIN clients c ON c.id = ca.client_id
     WHERE ca.email = ?`,
    [email.toLowerCase().trim()]
  );

  if (!admin) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Check if client is pending email verification
  if (admin.client_status === "pending") {
    return res.status(403).json({
      error: "Please verify your email before logging in. Check your inbox for the verification link.",
      pending_verification: true
    });
  }

  // Check if client is active
  if (admin.client_status !== "active") {
    return res.status(403).json({ error: "Your account has been deactivated. Please contact support." });
  }

  const isValidPassword = await comparePassword(password, admin.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Create session
  req.session.user = {
    id: admin.id,
    email: admin.email,
    role: "client_admin",
    client_id: admin.client_id,
    company_name: admin.company_name
  };

  res.json({
    user: {
      id: admin.id,
      email: admin.email,
      role: "client_admin",
      client_id: admin.client_id,
      company_name: admin.company_name
    }
  });
});

// Request password reset
router.post("/admin/forgot-password", resetLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Look up admin (allow pending accounts too - they may need to reset before verifying)
    const admin = await db.get(
      `SELECT ca.id, ca.email
       FROM client_admins ca
       JOIN clients c ON c.id = ca.client_id
       WHERE ca.email = ? AND c.status IN ('active', 'pending')`,
      [email.toLowerCase().trim()]
    );

    if (admin) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.run(
        "UPDATE client_admins SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
        [token, expires.toISOString(), admin.id]
      );

      await sendPasswordResetEmail(admin.email, token);
    }

    // Always return success to avoid leaking whether email exists
    res.json({ message: "If an account exists with that email, a password reset link has been sent." });
  } catch (err) {
    console.error("Password reset request error:", err);
    res.json({ message: "If an account exists with that email, a password reset link has been sent." });
  }
});

// Reset password with token
router.post("/admin/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const admin = await db.get(
      "SELECT id FROM client_admins WHERE password_reset_token = ? AND password_reset_expires > NOW()",
      [token]
    );

    if (!admin) {
      return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    }

    const passwordHash = await hashPassword(password);

    await db.run(
      "UPDATE client_admins SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
      [passwordHash, admin.id]
    );

    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "An error occurred. Please try again." });
  }
});

// Logout (works for both SuperAdmin and Client Admin)
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.json({ ok: true });
  });
});

// Get current authentication status
router.get("/status", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ authenticated: false, user: null });
  }

  res.json({
    authenticated: true,
    user: req.session.user
  });
});

export default router;
