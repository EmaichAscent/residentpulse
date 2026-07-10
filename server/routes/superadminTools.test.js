import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// SuperAdmin operator tools vs the Zoho-parity changes. Two latent
// regressions found by inspection (July 2026) and pinned here:
//
//   1. Impersonation borrowed the client's FIRST admin login. With
//      Phase G, /auth/status refreshes admin_role from that login's DB
//      row — so borrowing a viewer would silently downgrade the
//      operator to read-only mid-impersonation.
//   2. Mock test-survey sessions never bound a survey template, so the
//      test tool would show the LEGACY chat even for template-enabled
//      clients — untestable hybrid.

describe("impersonation vs viewer role", () => {
  let superadminSrc;
  let authSrc;
  beforeAll(async () => {
    superadminSrc = await readFile(join(__dirname, "superadmin.js"), "utf8");
    authSrc = await readFile(join(__dirname, "auth.js"), "utf8");
  });

  it("prefers a full admin login over a viewer when picking who to borrow", () => {
    expect(superadminSrc).toMatch(/ORDER BY CASE WHEN role = 'viewer' THEN 1 ELSE 0 END/);
  });

  it("impersonation sessions always carry admin_role 'admin'", () => {
    const impersonateBlock = superadminSrc.slice(
      superadminSrc.indexOf('"/clients/:id/impersonate"'),
      superadminSrc.indexOf('"/clients/:id/impersonate"') + 2500
    );
    expect(impersonateBlock).toMatch(/admin_role: "admin"/);
    expect(impersonateBlock).toMatch(/impersonating: true/);
  });

  it("/auth/status never overwrites admin_role while impersonating", () => {
    expect(authSrc).toMatch(
      /if \(!req\.session\.user\.impersonating\) \{\s*req\.session\.user\.admin_role/
    );
  });
});

describe("mock test-survey sessions vs the hybrid flow", () => {
  let source;
  beforeAll(async () => {
    source = await readFile(join(__dirname, "superadmin.js"), "utf8");
  });

  it("mock sessions bind the client's published template like real sessions", () => {
    expect(source).toMatch(/resolveTemplateVersionId\(clientId\)/);
    expect(source).toMatch(/is_mock, template_version_id/);
  });

  it("mock sessions still carry is_mock (excluded from dashboards/alerts)", () => {
    expect(source).toMatch(/VALUES \(\?, \?, \?, \?, \?, NULL, \?, TRUE, \?\)/);
  });
});
