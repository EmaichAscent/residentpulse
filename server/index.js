import "dotenv/config";
import "express-async-errors";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import fileUpload from "express-fileupload";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./utils/logger.js";
import sessionRoutes from "./routes/sessions.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/users.js";
import insightsRoutes from "./routes/insights.js";
import authRoutes from "./routes/auth.js";
import signupRoutes from "./routes/signup.js";
import superadminRoutes from "./routes/superadmin.js";
import surveyRoundsRoutes from "./routes/surveyRounds.js";
import interviewRoutes from "./routes/interview.js";
import webhookRoutes from "./routes/webhooks.js";
import zohoWebhookRoutes from "./routes/zohoWebhooks.js";
import { startScheduler } from "./scheduler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// --- Startup environment variable validation ---
const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET", "RESEND_API_KEY", "SURVEY_BASE_URL"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  logger.fatal(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// Trust Railway's reverse proxy for rate limiting and session management
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled — SPA serves its own inline styles/scripts
  crossOriginEmbedderPolicy: false, // Allow loading external resources (e.g. fonts)
}));

// PostgreSQL session store
const PgStore = connectPgSimple(session);
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Session configuration
app.use(session({
  store: new PgStore({
    pool: sessionPool,
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000 // 30 minutes
  }
}));

// CORS configuration - in production, client is served from same origin
const corsOrigin = process.env.NODE_ENV === "production"
  ? true // Allow same origin in production
  : (process.env.CLIENT_URL || "http://localhost:5173");

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    // Save raw body for webhook signature verification
    if (req.url.startsWith("/resend") || req.originalUrl?.startsWith("/api/webhooks")) {
      req.rawBody = buf.toString();
    }
  }
}));
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  abortOnLimit: true,
  responseOnLimit: "File too large. Maximum upload size is 5 MB."
}));

// Auth routes (login/logout)
app.use("/api/auth", authRoutes);

// Public signup routes
app.use("/api/signup", signupRoutes);

// SuperAdmin routes
app.use("/api/superadmin", superadminRoutes);

// Client Admin routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/admin/insights", insightsRoutes);
app.use("/api/admin/survey-rounds", surveyRoundsRoutes);
app.use("/api/admin/interview", interviewRoutes);

// Survey session routes
app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/users", userRoutes);

// Webhook routes (no auth — verified by signature)
app.use("/api/webhooks", webhookRoutes);
app.use("/api/webhooks", zohoWebhookRoutes);

// Health check endpoint
app.get("/api/health", async (_req, res) => {
  try {
    await sessionPool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy", error: "database unreachable" });
  }
});

// Serve static files from client build in production
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = join(__dirname, "..", "client", "dist");
  app.use(express.static(clientBuildPath));

  // Serve index.html for all non-API routes (SPA fallback)
  app.get("*", (req, res) => {
    res.sendFile(join(clientBuildPath, "index.html"));
  });
}

// Global error handler — catches unhandled async errors from all routes
app.use((err, _req, res, _next) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// Start the daily survey round scheduler
startScheduler();

const server = app.listen(PORT, () => {
  logger.info(`ResidentPulse server running on http://localhost:${PORT}`);
});

// Graceful shutdown — finish in-flight requests before exiting
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully...");
  server.close(() => {
    sessionPool.end();
    logger.info("Server closed.");
    process.exit(0);
  });
});
