import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";

/**
 * End-to-end integration test for the structured-block endpoints
 * (PR 4 of the SuperAdmin overhaul). Exercises the actual route
 * handler against a stubbed DB to catch the kind of regression the
 * source-level tests can't see — e.g. middleware order, JSON
 * serialization, error swallowing.
 *
 * Mocks db so we don't need a Postgres instance; mocks
 * requireSuperAdmin so we can hit the route without a session.
 */

vi.mock("../db.js", () => ({
  default: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  requireSuperAdmin: (_req, _res, next) => next(),
}));

let db;
let superadminRoutes;

beforeAll(async () => {
  db = (await import("../db.js")).default;
  superadminRoutes = (await import("./superadmin.js")).default;
});

afterAll(() => {
  vi.restoreAllMocks();
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/superadmin", superadminRoutes);
  return app;
}

async function fetchRoute(app, method, path) {
  // Spin up the express app on an ephemeral port and hit it with global
  // fetch — gives us a real HTTP round-trip including content-type
  // negotiation.
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // leave json null so the test can assert on raw text
    }
    return { status: res.status, contentType: res.headers.get("content-type"), text, json };
  } finally {
    server.close();
  }
}

describe("SuperAdmin block endpoints — integration", () => {
  it("GET /api/superadmin/prompts/system_prompt/blocks returns JSON, not HTML", async () => {
    db.get.mockImplementation((sql) => {
      if (sql.includes("FROM settings")) {
        return Promise.resolve({ value: "Persona\n  You are a test." });
      }
      if (sql.includes("FROM prompt_versions")) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    const app = makeApp();
    const res = await fetchRoute(app, "GET", "/api/superadmin/prompts/system_prompt/blocks");

    expect(res.contentType).toMatch(/application\/json/);
    expect(res.status).toBe(200);
    expect(res.json).not.toBeNull();
    expect(res.json.prompt_key).toBe("system_prompt");
    expect(Array.isArray(res.json.blocks)).toBe(true);
  });

  it("GET with an invalid key returns 400 JSON (not an HTML 404)", async () => {
    const app = makeApp();
    const res = await fetchRoute(app, "GET", "/api/superadmin/prompts/not_a_real_key/blocks");

    expect(res.contentType).toMatch(/application\/json/);
    expect(res.status).toBe(400);
    expect(res.json?.error).toBeTruthy();
  });

  it("GET for all three real prompt keys returns JSON without throwing", async () => {
    db.get.mockImplementation((sql) => {
      if (sql.includes("FROM settings")) return Promise.resolve({ value: "" });
      return Promise.resolve(null);
    });

    const app = makeApp();
    for (const key of [
      "system_prompt",
      "interview_initial_prompt",
      "prompt_generation_instruction",
    ]) {
      const res = await fetchRoute(app, "GET", `/api/superadmin/prompts/${key}/blocks`);
      expect(res.contentType, `key=${key}`).toMatch(/application\/json/);
      expect(res.status, `key=${key}`).toBe(200);
    }
  });

  it("GET handles a thrown DB error by returning 500 JSON (not a leaked HTML stack)", async () => {
    db.get.mockRejectedValue(new Error("simulated DB outage"));

    const app = makeApp();
    const res = await fetchRoute(app, "GET", "/api/superadmin/prompts/system_prompt/blocks");

    expect(res.contentType).toMatch(/application\/json/);
    expect(res.status).toBe(500);
    expect(res.json?.error).toBeTruthy();
  });
});
