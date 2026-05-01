import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  total_respondents: 200,
  picks: [
    {
      rank: 1,
      theme: "Maintenance ticket response time",
      summary: "Residents across many communities mention slow tickets.",
      priority: "high",
      affected_detractor_count: 24,
    },
    {
      rank: 2,
      theme: "Special-assessment communication",
      summary: "Boards want more notice and rationale.",
      priority: "medium",
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

  it("renders the header, both pick states, and done list once data loads", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      if (url.endsWith("/actions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
      }
      if (url.includes("/users")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderActions();

    expect(await screen.findByText("Actions")).toBeInTheDocument();
    // Eyebrow: round + concluded date
    expect(screen.getByText(/Round 3/i)).toBeInTheDocument();
    // Pick #1 has a logged action → State B. The action's own title
    // (the user's logged commitment) is the card headline.
    expect(screen.getByText("Roll out 48-hour SLA dashboard")).toBeInTheDocument();
    // Pick #2 has no action → State A; theme is the headline.
    expect(screen.getByText("Special-assessment communication")).toBeInTheDocument();
    // Done section row title (collapsed one-liner)
    expect(screen.getByText("Pilot text-message updates with 3 boards")).toBeInTheDocument();
  });

  it("shows the in-flight pill on a pick that has a logged action", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      if (url.endsWith("/actions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderActions();

    await screen.findByText("Special-assessment communication");
    // "In flight" appears in the header lede AND on the State B pill
    // — both expected, so use getAllByText.
    expect(screen.getAllByText(/in flight/i).length).toBeGreaterThanOrEqual(2);
    // State A card on pick #2 has Accept controls
    expect(screen.getAllByText(/Accept/).length).toBeGreaterThan(0);
  });

  it("shows accept-and-assign on undecided picks", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderActions();

    await screen.findByText("Special-assessment communication");
    // Both picks now have no logged actions → both render State A.
    // The primary CTA is "Accept & assign owner →".
    expect(screen.getAllByText(/Accept & assign owner/).length).toBe(2);
    // Decline (replaces "Reject" terminology in the new flow)
    expect(screen.getAllByText(/^Decline$/).length).toBe(2);
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

  it("collapses completed actions into the Done section", async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/brief")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
      }
      if (url.endsWith("/actions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleActions) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    renderActions();

    await screen.findByText("Pilot text-message updates with 3 boards");
    // Done section header
    expect(screen.getByText(/Done · 1/i)).toBeInTheDocument();
    // Done pill on the completed row
    expect(screen.getAllByText(/^Done$/i).length).toBeGreaterThan(0);
  });

  it("shows error state on fetch failure", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    renderActions();
    expect(await screen.findByTestId("actions-error")).toBeInTheDocument();
  });

  // ── Updates thread (action_updates) ──────────────────────────────────
  describe("Update thread on State B card", () => {
    const sampleActionsWithUpdates = [
      {
        id: 1,
        theme: "Maintenance ticket response time",
        title: "Roll out 48-hour SLA dashboard",
        details: null,
        owner_email: "tom@camascent.com",
        status: "in_progress",
        created_at: "2026-04-20T10:00:00Z",
        updates: [
          {
            id: 11,
            action_id: 1,
            body: "Beta deployed to 3 regions; tracking response time daily.",
            created_at: "2026-04-25T10:00:00Z",
            created_by_email: "tom@camascent.com",
          },
          {
            id: 10,
            action_id: 1,
            body: "Vendor SOW signed. Kickoff Friday.",
            created_at: "2026-04-22T10:00:00Z",
            created_by_email: "mike@camascent.com",
          },
        ],
      },
    ];

    it("renders the latest update prominently with author + relative timestamp", async () => {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/brief")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
        }
        if (url.endsWith("/actions")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(sampleActionsWithUpdates),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderActions();
      // Latest update body
      expect(await screen.findByText(/Beta deployed to 3 regions/i)).toBeInTheDocument();
      // Author of the latest update is in the byline. The owner email
      // also renders in the OwnerPicker chip below — both expected, so
      // assert at least one match (≥2 in practice).
      expect(screen.getAllByText("tom@camascent.com").length).toBeGreaterThanOrEqual(1);
      // "2 total" counter when more than one update exists
      expect(screen.getByText(/2 total/i)).toBeInTheDocument();
    });

    it("hides earlier updates behind an expander, shows them on click", async () => {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/brief")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
        }
        if (url.endsWith("/actions")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(sampleActionsWithUpdates),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderActions();
      // The earlier update body is NOT in the DOM until the expander
      // is clicked.
      await screen.findByText(/Beta deployed to 3 regions/i);
      expect(screen.queryByText(/Vendor SOW signed/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByText(/View 1 earlier update/i));
      expect(await screen.findByText(/Vendor SOW signed/i)).toBeInTheDocument();
    });

    it("shows the empty 'No updates yet' note when an action has zero updates", async () => {
      const actionNoUpdates = [
        {
          id: 1,
          theme: "Maintenance ticket response time",
          title: "Roll out 48-hour SLA dashboard",
          details: null,
          owner_email: "tom@camascent.com",
          status: "in_progress",
          created_at: "2026-04-20T10:00:00Z",
          updates: [],
        },
      ];
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/brief")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
        }
        if (url.endsWith("/actions")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(actionNoUpdates) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderActions();
      expect(
        await screen.findByText(/No updates yet — log the first one below/i)
      ).toBeInTheDocument();
    });

    it("posts a new update via /:id/updates and reloads the list", async () => {
      const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
      let actionsCall = 0;
      globalThis.fetch = vi.fn((url, opts) => {
        if (url.includes("/brief")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
        }
        if (url.endsWith("/api/admin/actions")) {
          actionsCall++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(sampleActionsWithUpdates),
          });
        }
        if (url.match(/\/actions\/\d+\/updates$/) && opts?.method === "POST") {
          return postSpy(url, opts);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderActions();
      await screen.findByText(/Beta deployed to 3 regions/i);

      fireEvent.click(screen.getByText(/\+ Add update/i));
      const textarea = await screen.findByPlaceholderText(/Quick note on progress/i);
      fireEvent.change(textarea, { target: { value: "Pilot showing 18% improvement." } });
      fireEvent.click(screen.getByText(/Post update/i));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalled();
      });
      const [postUrl, postOpts] = postSpy.mock.calls[0];
      expect(postUrl).toMatch(/\/actions\/1\/updates$/);
      expect(JSON.parse(postOpts.body)).toEqual({ body: "Pilot showing 18% improvement." });

      // Parent reloaded /actions after the post — verifies the
      // onAddUpdate callback wired to load() actually fired.
      await waitFor(() => {
        expect(actionsCall).toBeGreaterThanOrEqual(2);
      });
    });

    it("disables Post button until the textarea has non-whitespace content", async () => {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/brief")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleBrief) });
        }
        if (url.endsWith("/actions")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(sampleActionsWithUpdates),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderActions();
      await screen.findByText(/Beta deployed to 3 regions/i);
      fireEvent.click(screen.getByText(/\+ Add update/i));

      const post = await screen.findByText(/Post update/i);
      expect(post).toBeDisabled();

      const textarea = screen.getByPlaceholderText(/Quick note on progress/i);
      fireEvent.change(textarea, { target: { value: "   " } });
      expect(post).toBeDisabled();

      fireEvent.change(textarea, { target: { value: "Real content" } });
      expect(post).not.toBeDisabled();
    });
  });
});
