import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AdminPage from "./AdminPage";

// Outlet children are simple stubs — we're testing the shell, not the screens.
function StubScreen({ name }) {
  return <div data-testid={`screen-${name}`}>{name}</div>;
}

function renderShell({ initialPath = "/admin/home", authResp, logoOk = false } = {}) {
  globalThis.fetch = vi.fn((url) => {
    if (url === "/api/auth/status") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            authResp || {
              authenticated: true,
              user: {
                role: "client_admin",
                first_name: "Mike",
                last_name: "Hardy",
                email: "mike@camascent.com",
                company_name: "Zee Best Mgmt",
                plan_name: "growth",
              },
            }
          ),
      });
    }
    if (url === "/api/admin/account/logo") {
      return Promise.resolve({ ok: logoOk });
    }
    if (url === "/api/admin/board-members/bounce-count") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ bounce_count: 2 }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin" element={<AdminPage />}>
          <Route path="home" element={<StubScreen name="home" />} />
          <Route path="actions" element={<StubScreen name="actions" />} />
          <Route path="rounds" element={<StubScreen name="rounds" />} />
          <Route path="trends" element={<StubScreen name="trends" />} />
          <Route path="communities" element={<StubScreen name="communities" />} />
          <Route path="members" element={<StubScreen name="members" />} />
          <Route path="account" element={<StubScreen name="account" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminPage shell — Phase 3 PR4 left-rail design", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the left rail with brand and ADMIN section", async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId("admin-rail")).toBeInTheDocument());
    // "ResidentPulse" appears in the brand AND in the breadcrumb.
    expect(screen.getAllByText("ResidentPulse").length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText("Zee Best Mgmt")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders all 7 admin nav items", async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId("nav-home")).toBeInTheDocument());
    for (const path of [
      "home",
      "actions",
      "rounds",
      "trends",
      "communities",
      "members",
      "account",
    ]) {
      expect(screen.getByTestId(`nav-${path}`)).toBeInTheDocument();
    }
  });

  it("highlights the active nav item from the URL", async () => {
    renderShell({ initialPath: "/admin/actions" });
    await waitFor(() => expect(screen.getByTestId("nav-actions")).toBeInTheDocument());
    // CSS variables don't compute in jsdom; assert against the inline style
    // attribute string instead. Active uses var(--ink); inactive is transparent.
    expect(screen.getByTestId("nav-actions").getAttribute("style")).toMatch(/var\(--ink\)/);
    expect(screen.getByTestId("nav-home").getAttribute("style")).toMatch(/transparent/);
  });

  it("renders the breadcrumb with the active page label", async () => {
    renderShell({ initialPath: "/admin/communities" });
    await waitFor(() => {
      const breadcrumb = screen.getByTestId("breadcrumb");
      expect(breadcrumb).toHaveTextContent("ResidentPulse");
      expect(breadcrumb).toHaveTextContent("Communities");
    });
  });

  it("renders the Outlet content for the active route", async () => {
    renderShell({ initialPath: "/admin/trends" });
    expect(await screen.findByTestId("screen-trends")).toBeInTheDocument();
  });

  it("renders user-card with initials, name, and Sign out", async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId("user-card")).toBeInTheDocument());
    const card = screen.getByTestId("user-card");
    expect(card).toHaveTextContent("MH"); // initials from first+last name
    expect(card).toHaveTextContent("Mike Hardy");
    expect(card).toHaveTextContent("Sign out");
  });

  it("shows the bounce-count badge on Members nav when bounceCount > 0", async () => {
    renderShell();
    await waitFor(() => {
      const membersBtn = screen.getByTestId("nav-members");
      expect(membersBtn).toHaveTextContent("2");
    });
  });

  it("redirects to /admin/login when the user is unauthenticated", async () => {
    renderShell({
      authResp: { authenticated: false },
    });
    await waitFor(() => {
      // After redirect, the rail is no longer rendered
      expect(screen.queryByTestId("admin-rail")).not.toBeInTheDocument();
    });
  });

  it("renders the impersonation banner when user.impersonating is true", async () => {
    renderShell({
      authResp: {
        authenticated: true,
        user: {
          role: "client_admin",
          first_name: "Mike",
          email: "mike@camascent.com",
          company_name: "Zee Best",
          impersonating: true,
        },
      },
    });
    expect(await screen.findByText(/Viewing as: Zee Best/i)).toBeInTheDocument();
    expect(screen.getByText(/Exit impersonation/i)).toBeInTheDocument();
  });

  it("renders the test-mode banner when user is in test mode with the feature on", async () => {
    renderShell({
      authResp: {
        authenticated: true,
        user: {
          role: "client_admin",
          first_name: "Mike",
          email: "mike@camascent.com",
          company_name: "Zee Best",
          current_mode: "test",
          test_mode_feature: true,
        },
      },
    });
    expect(await screen.findByText(/Test mode/)).toBeInTheDocument();
    expect(screen.getByText(/sandbox data/i)).toBeInTheDocument();
  });

  it("clicking a nav item navigates to that route", async () => {
    renderShell({ initialPath: "/admin/home" });
    await screen.findByTestId("screen-home");
    fireEvent.click(screen.getByTestId("nav-trends"));
    expect(await screen.findByTestId("screen-trends")).toBeInTheDocument();
  });
});
