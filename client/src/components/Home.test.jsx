import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import Home from "./Home";

// AdminPage renders <Outlet context={{ user, ... }} />, and Home reads it
// via useOutletContext. Mirror that here so tests run Home in isolation.
function OutletWithUser({ user }) {
  return <Outlet context={{ user }} />;
}

function renderHome({ user = { first_name: "Mike" }, fetchImpl } = {}) {
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return render(
    <MemoryRouter initialEntries={["/admin/home"]}>
      <Routes>
        <Route path="/admin" element={<OutletWithUser user={user} />}>
          <Route path="home" element={<Home />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const sampleConcludedRound = {
  id: 42,
  round_number: 3,
  status: "concluded",
  concluded_at: "2026-04-15T10:00:00Z",
  responses_completed: 27,
};

const sampleInProgressRound = {
  id: 43,
  round_number: 4,
  status: "in_progress",
  launched_at: "2026-04-20T10:00:00Z",
  closes_at: "2026-05-20T10:00:00Z",
};

const sampleDashboardResponse = {
  nps: { score: 24 },
  response_rate: { completed: 27, invited: 35, percentage: 77 },
  is_paid_tier: true,
  community_analytics: {
    revenue_at_risk: {
      at_risk_value: 145000,
      total_portfolio_value: 1200000,
      percent_at_risk: 12,
    },
  },
};

describe("Home", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-30T10:00:00Z"));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders a loading state initially", () => {
    const fetchImpl = vi.fn(() => new Promise(() => {})); // never resolves
    renderHome({ fetchImpl });
    expect(screen.getByTestId("home-loading")).toBeInTheDocument();
  });

  it("greets the user by first name and shows the date", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHome({ user: { first_name: "Mike" }, fetchImpl });
    expect(await screen.findByText(/Mike/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no concluded or in-progress rounds", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHome({ fetchImpl });
    expect(await screen.findByText("No rounds yet")).toBeInTheDocument();
  });

  it("renders the hero row with NPS, response rate, and revenue at risk after fetching", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([sampleConcludedRound, sampleInProgressRound]),
        });
      }
      if (url.includes("/dashboard")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleDashboardResponse),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText(/Round 3 just closed/)).toBeInTheDocument());
    expect(screen.getByText("Portfolio NPS")).toBeInTheDocument();
    expect(screen.getByText("Response rate")).toBeInTheDocument();
    expect(screen.getByText("Revenue at risk")).toBeInTheDocument();
    expect(screen.getByText("+24")).toBeInTheDocument();
    expect(screen.getByText("77%")).toBeInTheDocument();
    expect(screen.getByText(/27 of 35 board members/)).toBeInTheDocument();
    expect(screen.getByText("$145k")).toBeInTheDocument();
  });

  it("shows revenue-at-risk paywall message for free-tier clients", async () => {
    const freeDashboard = { ...sampleDashboardResponse, is_paid_tier: false };
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([sampleConcludedRound]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(freeDashboard) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText(/Available on paid plans/)).toBeInTheDocument());
  });

  it("renders the rounds timeline with all rounds", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              sampleConcludedRound,
              sampleInProgressRound,
              { id: 44, round_number: 5, status: "planned", scheduled_date: "2026-08-01" },
            ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleDashboardResponse) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText("Survey rounds")).toBeInTheDocument());
    expect(screen.getByText("R3")).toBeInTheDocument();
    expect(screen.getByText("R4")).toBeInTheDocument();
    expect(screen.getByText("R5")).toBeInTheDocument();
    expect(screen.getByText("Concluded")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("renders the brief placeholder section", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([sampleConcludedRound]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleDashboardResponse) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText("This quarter's brief")).toBeInTheDocument());
    expect(screen.getByText(/Coming soon: 1.3 ranked picks/)).toBeInTheDocument();
  });

  it("shows an error when the rounds fetch fails", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false }));
    renderHome({ fetchImpl });
    expect(await screen.findByTestId("home-error")).toBeInTheDocument();
  });
});
