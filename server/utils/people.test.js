import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock("../db.js", () => ({
  default: {
    get: vi.fn(),
    run: vi.fn(),
    all: vi.fn(),
  },
}));

let db;
let people;

beforeEach(async () => {
  vi.resetModules();
  db = (await import("../db.js")).default;
  people = await import("./people.js");
  vi.clearAllMocks();
});

describe("resolveManagerId / resolveBookkeeperId", () => {
  it("returns null for empty, whitespace, and missing names", async () => {
    expect(await people.resolveManagerId(1, "", false)).toBe(null);
    expect(await people.resolveManagerId(1, "   ", false)).toBe(null);
    expect(await people.resolveManagerId(1, null, false)).toBe(null);
    expect(await people.resolveManagerId(1, undefined, false)).toBe(null);
    expect(db.get).not.toHaveBeenCalled();
    expect(db.run).not.toHaveBeenCalled();
  });

  it("returns the existing row's id without inserting", async () => {
    db.get.mockResolvedValueOnce({ id: 42 });
    const id = await people.resolveManagerId(7, "Debbie Smith", false);
    expect(id).toBe(42);
    expect(db.run).not.toHaveBeenCalled();
    // Lookup is scoped to (client, name, is_test)
    expect(db.get.mock.calls[0][1]).toEqual([7, "Debbie Smith", false]);
  });

  it("creates the row when missing and returns the new id", async () => {
    db.get.mockResolvedValueOnce(null);
    db.run.mockResolvedValueOnce({ lastInsertRowid: 99 });
    const id = await people.resolveManagerId(7, "  New Manager  ", true);
    expect(id).toBe(99);
    // Name is trimmed before storage
    expect(db.run.mock.calls[0][1]).toEqual([7, "New Manager", true]);
  });

  it("survives a concurrent-insert race (ON CONFLICT eats the insert)", async () => {
    db.get.mockResolvedValueOnce(null); // initial lookup: not found
    db.run.mockResolvedValueOnce({ lastInsertRowid: undefined }); // conflict: no id back
    db.get.mockResolvedValueOnce({ id: 55 }); // re-fetch finds the winner
    const id = await people.resolveBookkeeperId(3, "Pat Books", false);
    expect(id).toBe(55);
  });

  it("managers and bookkeepers hit their own tables", async () => {
    db.get.mockResolvedValue({ id: 1 });
    await people.resolveManagerId(1, "A", false);
    await people.resolveBookkeeperId(1, "A", false);
    expect(db.get.mock.calls[0][0]).toMatch(/FROM managers/);
    expect(db.get.mock.calls[1][0]).toMatch(/FROM bookkeepers/);
  });
});

describe("add-entity-promotion-backfill migration", () => {
  let sql;
  it("loads", async () => {
    sql = await readFile(
      join(__dirname, "..", "migrations", "add-entity-promotion-backfill.sql"),
      "utf8"
    );
    expect(sql.length).toBeGreaterThan(0);
  });

  it("is idempotent — insert guarded by ON CONFLICT, link only fills NULLs", async () => {
    sql = await readFile(
      join(__dirname, "..", "migrations", "add-entity-promotion-backfill.sql"),
      "utf8"
    );
    expect(sql).toMatch(/ON CONFLICT \(client_id, name, is_test\) DO NOTHING/);
    expect(sql).toMatch(/c\.manager_id IS NULL/);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it("only backfills non-empty names and preserves is_test scoping", async () => {
    sql = await readFile(
      join(__dirname, "..", "migrations", "add-entity-promotion-backfill.sql"),
      "utf8"
    );
    expect(sql).toMatch(/TRIM\(c\.community_manager_name\) != ''/);
    expect(sql).toMatch(/COALESCE\(c\.is_test, FALSE\)/);
  });

  it("is wired into db.js startup", async () => {
    const dbJs = await readFile(join(__dirname, "..", "db.js"), "utf8");
    expect(dbJs).toMatch(/add-entity-promotion-backfill\.sql/);
  });
});
