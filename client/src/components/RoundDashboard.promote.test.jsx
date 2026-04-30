import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Source-level guards for the Round Results refresh (Phase 3 PR3):
 *   - AI narrative card renders only when there's an executive_summary
 *     and the round is concluded.
 *   - "Promote to Action" button seeds the ActionDrawer with the
 *     warning's content (theme + details), and on save the user is
 *     redirected to /admin/actions.
 *
 * Full RoundDashboard render testing is out of scope here — too many
 * dependencies. These guards catch the changes that matter for PR3
 * without fighting the existing component's surface area.
 */
describe("RoundDashboard refresh — structural guards", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "RoundDashboard.jsx"), "utf8");
  });

  it("imports the ActionDrawer", () => {
    expect(source).toMatch(/import ActionDrawer from "\.\/ActionDrawer"/);
  });

  it("declares a promoteSeed state hook", () => {
    expect(source).toMatch(/setPromoteSeed/);
    expect(source).toMatch(/useState\(null\)/);
  });

  it("renders the AI narrative only when concluded AND insights.executive_summary present", () => {
    // The render gate is: isConcluded && insights?.executive_summary && !insights.error
    const narrativeStart = source.indexOf('data-testid="ai-narrative"');
    expect(narrativeStart).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, narrativeStart - 400), narrativeStart);
    expect(before).toMatch(/isConcluded/);
    expect(before).toMatch(/executive_summary/);
    expect(before).toMatch(/!insights\.error/);
  });

  it("AI narrative uses Fraunces display font + plum tint per design", () => {
    const narrativeStart = source.indexOf('data-testid="ai-narrative"');
    const block = source.slice(narrativeStart, narrativeStart + 2000);
    expect(block).toMatch(/var\(--font-display\)/);
    expect(block).toMatch(/var\(--plum-tint\)/);
    expect(block).toMatch(/The round in 60 seconds/);
  });

  it("'Promote to Action' button seeds the drawer with theme + alert details", () => {
    expect(source).toMatch(/Promote to Action/);
    // The setPromoteSeed call exists somewhere with the expected fields.
    // We don't fix the relative ordering — Prettier may reformat the line
    // structure, so search the whole file instead.
    const seedSetterMatch = source.match(/setPromoteSeed\(\{[\s\S]*?\}\)/);
    expect(seedSetterMatch).not.toBeNull();
    const seedSetter = seedSetterMatch[0];
    expect(seedSetter).toMatch(/theme:/);
    expect(seedSetter).toMatch(/alert\.alert_type/);
    expect(seedSetter).toMatch(/details:/);
    expect(seedSetter).toMatch(/round\.round_number/);
  });

  it("ActionDrawer is rendered with onSaved that redirects to /admin/actions", () => {
    // After promote-to-action save, send the user to the Actions screen so
    // they see the new entry land in the journal.
    const drawerStart = source.indexOf("<ActionDrawer");
    expect(drawerStart).toBeGreaterThan(-1);
    const block = source.slice(drawerStart, drawerStart + 600);
    expect(block).toMatch(/isOpen=\{!!promoteSeed\}/);
    expect(block).toMatch(/seed=\{promoteSeed\}/);
    expect(block).toMatch(/navigate\("\/admin\/actions"\)/);
  });
});
