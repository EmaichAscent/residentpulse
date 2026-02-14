import { Router } from "express";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import { comparePassword } from "../utils/password.js";

const router = Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: "Too many login attempts, please try again later" }
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
