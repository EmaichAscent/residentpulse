import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import fileUpload from "express-fileupload";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import sessionRoutes from "./routes/sessions.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/users.js";
import insightsRoutes from "./routes/insights.js";
import authRoutes from "./routes/auth.js";
import signupRoutes from "./routes/signup.js";
import superadminRoutes from "./routes/superadmin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's reverse proxy for rate limiting and session management
app.set('trust proxy', 1);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "residentpulse-dev-secret-change-in-production",
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
app.use(express.json());
app.use(fileUpload());

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

// Survey session routes
app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/users", userRoutes);

// Serve static files from client build in production
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = join(__dirname, "..", "client", "dist");
  app.use(express.static(clientBuildPath));

  // Serve index.html for all non-API routes (SPA fallback)
  app.get("*", (req, res) => {
    res.sendFile(join(clientBuildPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`ResidentPulse server running on http://localhost:${PORT}`);
});
