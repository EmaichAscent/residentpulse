import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ChatPage from "./ChatPage";

/**
 * Smoke tests for the resident chat after the scrap-and-rebuild.
 *
 * Focus: the things Mike's brief explicitly listed as must-preserve —
 * trust gate, resume behavior, NPS picker, send→PATCH wiring, mock
 * banner, Google Review CTA gating. Voice/mic are environment-gated
 * (window.SpeechRecognition / speechSynthesis); jsdom provides
 * speechSynthesis but not SpeechRecognition, so the mic button just
 * doesn't render in tests — that's fine.
 */
function renderChat({ state, fetchImpl } = {}) {
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/chat",
          state: state || baseState,
        },
      ]}
    >
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/" element={<div data-testid="root" />} />
      </Routes>
    </MemoryRouter>
  );
}

const baseState = {
  sessionId: 99,
  firstName: "Andrew",
  community: "Aspen Heights",
  company: "Zee Best Management",
  clientId: 1,
  hasLogo: false,
  companyName: "Zee Best",
  isMock: false,
  googleReviewUrl: "https://g.page/review",
};

const emptySessionResponse = (overrides = {}) => ({
  session: {
    nps_score: null,
    completed: false,
    community_manager_name: null,
    google_review_response: null,
    ...overrides,
  },
  messages: [],
});

describe("ChatPage", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(emptySessionResponse()) })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to / when no session is in the route state", () => {
    renderChat({ state: {} });
    expect(screen.getByTestId("root")).toBeInTheDocument();
  });

  it("renders the card shell — progress bar, header, footer", async () => {
    renderChat();
    expect(await screen.findByTestId("chat-card")).toBeInTheDocument();
    expect(screen.getByTestId("chat-header")).toBeInTheDocument();
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
    // Company display in header (also appears inside the welcome
    // bubble — at least one instance must be present)
    expect(screen.getAllByText(/Zee Best Management/i).length).toBeGreaterThan(0);
    // Subtitle: community + check-in for {firstName}
    expect(screen.getByText(/Aspen Heights · check-in for Andrew/i)).toBeInTheDocument();
    // Confidential indicator
    expect(screen.getByText(/Confidential/i)).toBeInTheDocument();
    // Footer brand line
    expect(screen.getByText(/Powered by ResidentPulse/i)).toBeInTheDocument();
  });

  it("starts on the trust gate — welcome bubble + Sounds good CTA, no NPS picker yet", async () => {
    renderChat();
    expect(await screen.findByTestId("trust-gate-actions")).toBeInTheDocument();
    expect(screen.getByText(/Sounds good/i)).toBeInTheDocument();
    // Welcome copy mentions the resident's name
    expect(screen.getByText(/Hi Andrew/i)).toBeInTheDocument();
    // NPS picker is NOT shown until trust is accepted
    expect(screen.queryByTestId("nps-scale")).not.toBeInTheDocument();
  });

  it("clicking Sounds good reveals the NPS picker (welcome + prompt + 11-button scale)", async () => {
    renderChat();
    fireEvent.click(await screen.findByText(/Sounds good/i));
    expect(await screen.findByTestId("nps-scale")).toBeInTheDocument();
    // The hardcoded NPS prompt names the company
    expect(screen.getByText(/On a scale of 0 to 10/i)).toBeInTheDocument();
    // 11 NPS buttons (0-10) all present
    for (let i = 0; i <= 10; i++) {
      expect(screen.getByLabelText(`NPS score ${i}`)).toBeInTheDocument();
    }
    // Trust-gate CTA is gone
    expect(screen.queryByText(/Sounds good/)).not.toBeInTheDocument();
  });

  it("resume: a session with an existing nps_score skips trust gate + lands in conversation view", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            session: { nps_score: 8, completed: false, community_manager_name: "Sarah" },
            messages: [
              {
                role: "assistant",
                content: "An 8 — solid. What's been driving the score?",
                created_at: "2026-04-20T10:00:00Z",
              },
            ],
          }),
      })
    );
    renderChat();
    // Existing assistant message shows
    expect(await screen.findByText(/What's been driving the score/i)).toBeInTheDocument();
    // No trust gate, no NPS picker
    expect(screen.queryByTestId("trust-gate-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nps-scale")).not.toBeInTheDocument();
    // Input bar is shown (post-NPS phase)
    expect(screen.getByPlaceholderText(/Type your answer/i)).toBeInTheDocument();
    // Footer "End early" is present
    expect(screen.getByText(/End early/i)).toBeInTheDocument();
  });

  it("picking an NPS score PATCHes the session and sends the score as a chat message", async () => {
    const calls = [];
    globalThis.fetch = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (url.match(/sessions\/99$/)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(emptySessionResponse()) });
      }
      if (url.match(/sessions\/99\/nps/) && opts?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.endsWith("/api/chat") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              message: "An 8 — solid. What's driving that?",
              timestamp: "2026-04-20T10:01:00Z",
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderChat();
    fireEvent.click(await screen.findByText(/Sounds good/i));
    fireEvent.click(await screen.findByLabelText("NPS score 8"));

    await waitFor(() => {
      const npsCall = calls.find((c) => c.url.match(/sessions\/99\/nps/));
      expect(npsCall).toBeDefined();
      expect(JSON.parse(npsCall.opts.body)).toEqual({ nps_score: 8 });
    });

    // Chat POST fires with the NPS-as-message body
    await waitFor(() => {
      const chatCall = calls.find((c) => c.url.endsWith("/api/chat"));
      expect(chatCall).toBeDefined();
      const body = JSON.parse(chatCall.opts.body);
      expect(body.session_id).toBe(99);
      expect(body.message).toMatch(/NPS score is 8/i);
    });
  });

  it("End early PATCHes /complete and shows the thank-you state", async () => {
    let completeCalled = false;
    globalThis.fetch = vi.fn((url, opts) => {
      if (url.match(/sessions\/99\/complete/) && opts?.method === "PATCH") {
        completeCalled = true;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.match(/sessions\/99$/)) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              session: { nps_score: 8, completed: false, google_review_response: null },
              messages: [],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderChat();
    // Resume puts us straight into conversation view
    fireEvent.click(await screen.findByText(/End early/i));

    await waitFor(() => expect(completeCalled).toBe(true));
    expect(await screen.findByText(/Thanks for sharing your feedback/i)).toBeInTheDocument();
    // Input bar is gone after completion
    expect(screen.queryByPlaceholderText(/Type your answer/i)).not.toBeInTheDocument();
  });

  it("shows the Google Review CTA only when score ≥ 9 and review wasn't declined", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            session: { nps_score: 10, completed: true, google_review_response: null },
            messages: [],
          }),
      })
    );
    renderChat();
    expect(await screen.findByText(/Leave a Google Review/i)).toBeInTheDocument();
  });

  it("hides the Google Review CTA for non-promoters", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            session: { nps_score: 7, completed: true, google_review_response: null },
            messages: [],
          }),
      })
    );
    renderChat();
    await screen.findByText(/Thanks for sharing your feedback/i);
    expect(screen.queryByText(/Leave a Google Review/i)).not.toBeInTheDocument();
  });

  it("renders the Mock Survey banner when isMock is true", async () => {
    renderChat({ state: { ...baseState, isMock: true } });
    expect(await screen.findByText(/Mock Survey Mode/i)).toBeInTheDocument();
  });
});
