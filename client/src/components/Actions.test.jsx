import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import Actions from "./Actions";

function OutletWithUser({ user }) {
  return <Outlet context={{ user }} />;
}

function renderActions({ user = { email: "mike@camascent.com" }, fetchImpl } = {}) {
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return render(
    <MemoryRouter initialEntries={["/admin/actions"]}>
      <Routes>
        <Route path="/admin" element={<OutletWithUser user={user} />}>
          <Route path="actions" element={<Actions />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const sampleBrief = {
  round: { id: 42, round_number: 3, concluded_at: "2026-04-15T10:00:00Z" },
  picks: [
    {
      rank: 1,
      theme: "Maintenance ticket response time",
      summary: "Residents across many communities mention slow tickets.",
      has_action: false,
    },
    {
      rank: 2,
      theme: "Special-assessment communication",
      summary: "Boards want more notice and rationale.",
      has_action: true,
    },
  ],
};

const sampleActions = [
  {
    id: 1,
    theme: "Maintenance ticket response time",
    title: "Roll out 48-hour SLA dashboard",
    details: null,
    owner_email: "tom@camascent.com",
    status: "in_progress",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: 2,
    theme: "Other",
    title: "Pilot text-message updates with 3 boards",
    details: "Starting with Crystal Heights, Aspen, and Magnolia.",
    owner_email: "mike@camascent.com",
    status: "completed",
    created_at: "2026-03-15T10:00:00Z",
    completed_at: "2026-04-10T10:00:00Z",
  },
];

describe("Actions screen", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a loading state initially", () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    renderActions();
    expect(screen.getByTestId("actions-loading")).toBeInTheDocument();
  });

  it("renders the header, brief picks, and journal once data loads", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      if (url.endsWith("/actions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderActions();

    expect(await screen.findByText("Actions")).toBeInTheDocument();
    expect(screen.getByText(/Round 3 · 2 picks/i)).toBeInTheDocument();
    // "Maintenance ticket response time" appears in both pick #1 AND action #1's
    // theme tag — getAllByText finds both, which is the expected behavior.
    expect(screen.getAllByText("Maintenance ticket response time").length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getByText("Special-assessment communication")).toBeInTheDocument();
    expect(screen.getByText("Roll out 48-hour SLA dashboard")).toBeInTheDocument();
    expect(screen.getByText("Pilot text-message updates with 3 boards")).toBeInTheDocument();
  });

  it("shows 'Action logged' badge when an action exists for a brief theme", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
    });

    renderActions();

    await screen.findByText("Special-assessment communication");
    // Pick #1 ("Maintenance...") has a matching action → badge
    expect(screen.getByText(/Action logged/i)).toBeInTheDocument();
    // Pick #2 ("Special-assessment...") does NOT → button shown
    expect(screen.getByText("Log what we're doing")).toBeInTheDocument();
  });

  it("filters journal by 'Mine' to current user only", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
    });

    renderActions({ user: { email: "mike@camascent.com" } });

    await screen.findByText("Roll out 48-hour SLA dashboard");
    fireEvent.click(screen.getByText(/^Mine \(/));

    // Tom's action should be hidden, Mike's should remain
    expect(screen.queryByText("Roll out 48-hour SLA dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Pilot text-message updates with 3 boards")).toBeInTheDocument();
  });

  it("filters journal by 'Completed'", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
    });

    renderActions();

    await screen.findByText("Roll out 48-hour SLA dashboard");
    fireEvent.click(screen.getByText(/^Completed \(/));

    expect(screen.queryByText("Roll out 48-hour SLA dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Pilot text-message updates with 3 boards")).toBeInTheDocument();
  });

  it("shows the empty-brief copy when no concluded round exists", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ round: null, picks: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderActions();

    expect(await screen.findByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText(/The brief generates from the AI insights/i)).toBeInTheDocument();
  });

  it("opens the action drawer when 'Log what we're doing' is clicked", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderActions();

    await screen.findByText("Special-assessment communication");
    // Both picks show "Log what we're doing" since actions=[] in this test.
    // Click the second one (Special-assessment) to differentiate from the first.
    const buttons = screen.getAllByText("Log what we're doing");
    fireEvent.click(buttons[1]);

    // Drawer header includes "Log an action · {theme}"
    expect(
      screen.getByText(/Log an action · Special-assessment communication/i)
    ).toBeInTheDocument();
    expect(screen.getByText("What are you doing about it?")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    renderActions();
    expect(await screen.findByTestId("actions-error")).toBeInTheDocument();
  });
});
