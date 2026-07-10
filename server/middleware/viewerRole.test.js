import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { blockViewerWrites, requireClientAdmin } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(middleware, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
}

const viewerSession = {
  session: { user: { role: "client_admin", admin_role: "viewer", client_id: 1, id: 9 } },
};
const adminSession = {
  session: { user: { role: "client_admin", admin_role: "admin", client_id: 1, id: 9 } },
};
const legacySession = {
  // Sessions created before Phase G have no admin_role — they default
  // to full access (today's behavior, back-compat).
  session: { user: { role: "client_admin", client_id: 1, id: 9 } },
};

describe("blockViewerWrites", () => {
  it("viewers can GET", () => {
    const { next } = run(blockViewerWrites, { ...viewerSession, method: "GET" });
    expect(next).toHaveBeenCalled();
  });

  it("viewers cannot POST/PUT/PATCH/DELETE — 403 with a human explanation", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const { res, next } = run(blockViewerWrites, { ...viewerSession, method });
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/View-only access/);
    }
  });

  it("full admins and legacy (pre-role) sessions write as before", () => {
    for (const req of [adminSession, legacySession]) {
      const { next } = run(blockViewerWrites, { ...req, method: "POST" });
      expect(next).toHaveBeenCalled();
    }
  });

  it("non-client sessions pass through (superadmin has its own gates)", () => {
    const { next } = run(blockViewerWrites, {
      method: "POST",
      session: { user: { role: "superadmin" } },
    });
    expect(next).toHaveBeenCalled();
  });
});

describe("requireClientAdmin — role attachment", () => {
  it("attaches adminRole, defaulting to 'admin' for pre-role sessions", () => {
    const req = { ...legacySession, method: "GET" };
    run(requireClientAdmin, req);
    expect(req.adminRole).toBe("admin");

    const req2 = { ...viewerSession, method: "GET" };
    run(requireClientAdmin, req2);
    expect(req2.adminRole).toBe("viewer");
  });
});

describe("Phase G wiring — structural guards", () => {
  it("migration adds the role column idempotently with the check constraint", async () => {
    const sql = await readFile(join(__dirname, "..", "migrations", "add-viewer-role.sql"), "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS client_admins_role_check/);
    expect(sql).toMatch(/CHECK \(role IN \('admin', 'viewer'\)\)/);
  });

  it("guard mounts on /api/admin before the admin routers", async () => {
    const indexJs = await readFile(join(__dirname, "..", "index.js"), "utf8");
    const guardIdx = indexJs.indexOf('app.use("/api/admin", blockViewerWrites)');
    const routerIdx = indexJs.indexOf('app.use("/api/admin", adminRoutes)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(routerIdx);
  });

  it("login and status expose admin_role to the client", async () => {
    const authJs = await readFile(join(__dirname, "..", "routes", "auth.js"), "utf8");
    expect(authJs).toMatch(/admin_role: admin\.role \|\| "admin"/);
    expect(authJs).toMatch(/ca\.role as admin_role/);
  });
});
