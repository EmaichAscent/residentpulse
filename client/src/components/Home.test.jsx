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
  launched_at: "2026-03-01T10:00:00Z",
  concluded_at: "2026-04-15T10:00:00Z",
  responses_completed: 27,
  members_invited: 35,
  active_alert_count: 0,
  insights_json: { nps_score: 24, executive_summary: "Big win." },
};

const sampleInProgressRound = {
  id: 43,
  round_number: 4,
  status: "in_progress",
  launched_at: "2026-04-20T10:00:00Z",
  closes_at: "2026-05-20T10:00:00Z",
};

const samplePlannedRound = {
  id: 44,
  round_number: 5,
  status: "planned",
  scheduled_date: "2026-08-01T10:00:00Z",
};

const sampleDashboardResponse = {
  round: { id: 42, round_number: 3 },
  nps: { score: 24 },
  response_rate: { completed: 27, invited: 35, percentage: 77 },
  community_analytics: {
    revenue_at_risk: {
      at_risk_value: 145000,
      total_portfolio_value: 1200000,
      percent_at_risk: 12,
      at_risk_communities: [{ name: "Foo" }, { name: "Bar" }],
    },
  },
  insights: { nps_score: 24, executive_summary: "Big win." },
  recommended_actions_status: [],
};

describe("Home — full rebuild per the design spec", () => {
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

  it("greets the user by first name with a time-of-day prefix", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHome({ user: { first_name: "Mike" }, fetchImpl });
    // 10am UTC at the fake system time → "morning" in whatever local
    // tz the test runs in. The greeting is "Good {tod}, Mike." so just
    // assert on the name + period combo.
    expect(await screen.findByText(/Mike\./)).toBeInTheDocument();
  });

  it("shows the empty state when there are no concluded or in-progress rounds", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHome({ fetchImpl });
    expect(await screen.findByText("No survey rounds yet")).toBeInTheDocument();
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleDashboardResponse) });
      }
      if (url.includes("/recent-activity")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText(/Round 3 just closed/)).toBeInTheDocument());
    // Card titles
    expect(screen.getByText(/Portfolio NPS — Round 3/)).toBeInTheDocument();
    expect(screen.getByText("Response rate")).toBeInTheDocument();
    expect(screen.getByText("Revenue at risk")).toBeInTheDocument();
    // Headline values — "+24" appears in BOTH the big NPS number and
    // the R3 cell of the round strip, so we expect ≥1 match.
    expect(screen.getAllByText("+24").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.getByText(/27 of 35 board members/)).toBeInTheDocument();
    expect(screen.getByText("$145k")).toBeInTheDocument();
  });

  it("renders the rounds timeline with concluded, live, and planned pills", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([sampleConcludedRound, sampleInProgressRound, samplePlannedRound]),
        });
      }
      if (url.includes("/recent-activity")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleDashboardResponse) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText("Survey rounds")).toBeInTheDocument());
    // Status pills. "Live" appears in BOTH the in-progress round's
    // status pill AND the recent-activity card's live indicator, so
    // use getAllByText.
    expect(screen.getByText("Concluded")).toBeInTheDocument();
    expect(screen.getAllByText("Live").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Planned")).toBeInTheDocument();
    // Round numbers in the timeline rows render as "Round N"
    expect(screen.getByText("Round 3")).toBeInTheDocument();
    expect(screen.getByText("Round 4")).toBeInTheDocument();
    expect(screen.getByText("Round 5")).toBeInTheDocument();
  });

  it("renders the recent-activity card with sentiment-tagged rows", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([sampleConcludedRound]),
        });
      }
      if (url.includes("/recent-activity")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 1,
                first_name: "Andrew",
                last_name: "Flores",
                community_name: "Aspen Heights",
                nps_score: 8,
                tone: "mid",
                flagged: false,
                created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
              },
              {
                id: 2,
                first_name: "Maria",
                last_name: "Sanchez",
                community_name: "Crystal Heights",
                nps_score: 2,
                tone: "bad",
                flagged: true,
                created_at: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
              },
            ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleDashboardResponse) });
    });

    renderHome({ fetchImpl });

    await waitFor(() => expect(screen.getByText("Recent activity")).toBeInTheDocument());
    expect(screen.getByText("Andrew Flores")).toBeInTheDocument();
    expect(screen.getByText("Aspen Heights")).toBeInTheDocument();
    expect(screen.getByText("Maria Sanchez")).toBeInTheDocument();
    expect(screen.getByText(/gave a 2 — flagged/)).toBeInTheDocument();
  });

  it("renders the 'this quarter, 3 things would move the needle most' brief when picks are present", async () => {
    const dashboardWithBrief = {
      ...sampleDashboardResponse,
      recommended_actions_status: [
        {
          rank: 1,
          action: "Maintenance ticket response time",
          priority: "high",
          mentions: 280,
          community_count: 47,
          nps_when_raised: 4,
          decision: null,
          logged_action_id: null,
        },
        {
          rank: 2,
          action: "Proactive communication before decisions",
          priority: "medium",
          mentions: 184,
          community_count: 38,
          nps_when_raised: 5,
          decision: "accepted",
          logged_action_id: null,
        },
      ],
    };
    const fetchImpl = vi.fn((url) => {
      if (url === "/api/admin/survey-rounds") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([sampleConcludedRound]),
        });
      }
      if (url.includes("/recent-activity")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(dashboardWithBrief) });
    });

    renderHome({ fetchImpl });

    await waitFor(() =>
      expect(
        screen.getByText("This quarter, 3 things would move the needle most")
      ).toBeInTheDocument()
    );
    expect(screen.getByText("Maintenance ticket response time")).toBeInTheDocument();
    expect(screen.getByText("Proactive communication before decisions")).toBeInTheDocument();
    // Mentions / communities / NPS when raised metric line
    expect(screen.getByText(/280/)).toBeInTheDocument();
    expect(screen.getByText(/47 communities/)).toBeInTheDocument();
  });

  it("shows an error when the rounds fetch fails", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false }));
    renderHome({ fetchImpl });
    expect(await screen.findByTestId("home-error")).toBeInTheDocument();
  });
});
