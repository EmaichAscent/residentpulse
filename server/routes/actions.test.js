import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level guards for the Actions route file.
 *
 * Same pattern we use elsewhere — until we have a route-level integration
 * harness against a test DB, these structural checks catch regressions like
 * "someone forgot to scope by client_id" or "someone reintroduced a write
 * path without input validation."
 */
describe("admin actions endpoints — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "actions.js"), "utf8");
  });

  it("requires client-admin auth on every route", () => {
    expect(source).toMatch(/router\.use\(requireClientAdmin\)/);
  });

  it("scopes the list query by client_id", () => {
    const start = source.indexOf('router.get("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/WHERE client_id/);
  });

  it("scopes the brief query by client_id and is_test", () => {
    const start = source.indexOf('router.get("/brief"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/WHERE client_id = \?/);
    expect(body).toMatch(/is_test/);
  });

  it("brief endpoint reads from concluded rounds with insights_json present", () => {
    const start = source.indexOf('router.get("/brief"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/status = 'concluded'/);
    expect(body).toMatch(/insights_json IS NOT NULL/);
  });

  it("brief caps picks at 3", () => {
    const start = source.indexOf('router.get("/brief"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/\.slice\(0, 3\)/);
  });

  it("POST validates theme and title are non-empty", () => {
    const start = source.indexOf('router.post("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/theme is required/);
    expect(body).toMatch(/title is required/);
  });

  it("POST stores client_id from req, not body (auth scoping)", () => {
    const start = source.indexOf('router.post("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/req\.clientId/);
  });

  it("PATCH validates status against allowlist", () => {
    expect(source).toMatch(/VALID_STATUSES\s*=\s*\["in_progress", "completed", "cancelled"\]/);
    const start = source.indexOf('router.patch("/:id"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/VALID_STATUSES\.includes/);
  });

  it("PATCH stamps completed_at when transitioning to completed", () => {
    const start = source.indexOf('router.patch("/:id"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/completed_at = CURRENT_TIMESTAMP/);
    // and clears it when transitioning back
    expect(body).toMatch(/completed_at = NULL/);
  });

  it("PATCH and DELETE check that the action belongs to the requesting client", () => {
    expect(
      source.match(/SELECT[\s\S]+?FROM actions WHERE id = \? AND client_id = \?/g)?.length || 0
    ).toBeGreaterThanOrEqual(2);
  });

  it("DELETE validates id is a positive integer", () => {
    const start = source.indexOf('router.delete("/:id"');
    const body = source.slice(start, source.length);
    expect(body).toMatch(/Number\.isInteger\(id\)/);
    expect(body).toMatch(/id <= 0/);
  });

  it("PATCH accepts owner_email reassignment and persists null on empty", () => {
    const start = source.indexOf('router.patch("/:id"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/owner_email/);
    expect(body).toMatch(/owner_email = \?/);
    // empty / whitespace-only emails should clear the owner
    expect(body).toMatch(/trimmed \|\| null/);
  });

  it("GET / returns each action with its updates array attached", () => {
    const start = source.indexOf('router.get("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/FROM action_updates/);
    expect(body).toMatch(/WHERE client_id = \?/);
    expect(body).toMatch(/updates: byAction\.get\(a\.id\)/);
  });

  it("GET / sorts updates newest first via SQL", () => {
    const start = source.indexOf('router.get("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/ORDER BY created_at DESC/);
  });

  it("POST /:id/updates requires a non-empty body", () => {
    const start = source.indexOf('router.post("/:id/updates"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/Update body is required/);
    expect(body).toMatch(/!body\.trim\(\)/);
  });

  it("POST /:id/updates checks the action belongs to the requesting client", () => {
    const start = source.indexOf('router.post("/:id/updates"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/FROM actions WHERE id = \? AND client_id = \?/);
    expect(body).toMatch(/Action not found/);
  });

  it("POST /:id/updates stamps created_by_email from the session, not the body", () => {
    const start = source.indexOf('router.post("/:id/updates"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    // author comes from req.userEmail (the auth middleware), never trusted
    // input. Body destructure only takes `body` — never created_by_email.
    expect(body).toMatch(/req\.userEmail/);
    expect(body).not.toMatch(/req\.body\.created_by_email/);
  });

  it("POST / seeds the first action_update from initial details", () => {
    const start = source.indexOf('router.post("/"');
    const body = source.slice(start, source.indexOf("router.", start + 1));
    expect(body).toMatch(/INSERT INTO action_updates/);
    expect(body).toMatch(/detailsTrimmed/);
  });
});
