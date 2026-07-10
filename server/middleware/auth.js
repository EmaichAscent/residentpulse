/**
 * Authentication middleware for SuperAdmin and Client Admin routes
 */

/**
 * Require SuperAdmin authentication
 * Checks if user is logged in as a superadmin
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "superadmin") {
    return res.status(401).json({ error: "Unauthorized - SuperAdmin access required" });
  }
  next();
}

/**
 * Require Client Admin authentication
 * Checks if user is logged in as a client admin and adds client_id to req
 */
export function requireClientAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "client_admin") {
    return res.status(401).json({ error: "Unauthorized - Client Admin access required" });
  }

  // Add client_id to request for easy access in routes
  req.clientId = req.session.user.client_id;
  req.userId = req.session.user.id;
  req.userEmail = req.session.user.email;
  // Client-login tier: 'admin' (full) or 'viewer' (read-only). Pre-role
  // sessions default to 'admin' — today's behavior.
  req.adminRole = req.session.user.admin_role || "admin";

  // Test mode: only active when feature flag is enabled AND admin has toggled to test
  const featureEnabled = process.env.FEATURE_TEST_MODE === "true";
  req.isTestMode = featureEnabled && req.session.user.current_mode === "test";

  next();
}

/**
 * Viewer write-guard (Zoho parity Phase G). Mounted on /api/admin
 * BEFORE the admin routers: a 'viewer' client login can GET anything
 * its client scope allows but every mutation is rejected server-side.
 * The UI hides mutation affordances too, but this 403 is the actual
 * guarantee.
 */
export function blockViewerWrites(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const user = req.session?.user;
  if (user?.role === "client_admin" && (user.admin_role || "admin") === "viewer") {
    return res.status(403).json({
      error: "View-only access — ask your account admin to make changes.",
    });
  }
  next();
}

/**
 * Check if user is authenticated (either SuperAdmin or Client Admin)
 * Used for routes that both can access
 */
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Unauthorized - Authentication required" });
  }
  next();
}

/**
 * Optional authentication - adds user info if logged in, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
}
