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
