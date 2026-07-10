import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SuperAdminSurveys from "./SuperAdminSurveys";

// The builder talks only to /api/superadmin/surveys/* (plus the client
// list for the new-template modal). Mock fetch per-URL.

const TEMPLATES = [
  {
    id: 1,
    name: "Self-Signup Baseline",
    client_id: null,
    client_name: null,
    is_default: true,
    question_count: 7,
    latest_version: 1,
  },
  {
    id: 2,
    name: "Cadden — Board Survey",
    client_id: 5,
    client_name: "Cadden Community Management",
    is_default: false,
    question_count: 2,
    latest_version: null,
  },
];

const DETAIL_T1 = {
  id: 1,
  name: "Self-Signup Baseline",
  client_id: null,
  is_default: true,
  versions: [{ id: 9, version_number: 1, published_at: "2026-07-01", published_by: "seed" }],
  questions: [
    {
      template_question_id: 11,
      question_id: 101,
      code: "Q001",
      label: "NPS — likelihood to recommend",
      category: "NPS",
      entity_target: "company",
      answer_format: "nps",
      tier: "required",
      sort_order: 0,
      nps_band_max: null,
      status: "active",
      rounds_with_answers: 4,
      triggers: [],
    },
    {
      template_question_id: 12,
      question_id: 104,
      code: "M04",
      label: "Responsive",
      category: "Manager",
      entity_target: "manager",
      answer_format: "likert5",
      tier: "contextual",
      sort_order: 1,
      nps_band_max: 6,
      status: "active",
      rounds_with_answers: 0,
      triggers: [{ id: 3, label: "responsiveness", description: "slow responses" }],
    },
    {
      template_question_id: 13,
      question_id: 108,
      code: "C08",
      label: "Board training resources",
      category: "Company service",
      entity_target: "company",
      answer_format: "likert5",
      tier: "required",
      sort_order: 2,
      nps_band_max: null,
      status: "retired",
      rounds_with_answers: 4,
      triggers: [],
    },
  ],
};

function mockFetch(overrides = {}) {
  return vi.fn(async (url, opts = {}) => {
    const respond = (data, status = 200) => ({
      ok: status < 400,
      status,
      headers: { get: () => "application/json" },
      json: async () => data,
    });
    if (typeof overrides[url] === "function") return overrides[url](opts);
    if (url.startsWith("/api/superadmin/surveys/templates/1")) return respond(DETAIL_T1);
    if (url.startsWith("/api/superadmin/surveys/templates")) return respond(TEMPLATES);
    if (url.startsWith("/api/superadmin/surveys/questions")) return respond([]);
    if (url.startsWith("/api/superadmin/surveys/triggers")) return respond([]);
    if (url.startsWith("/api/superadmin/clients")) return respond([]);
    return respond({}, 404);
  });
}

beforeEach(() => {
  globalThis.fetch = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SuperAdminSurveys — builder", () => {
  it("lists templates with default/concierge badges and opens the first", async () => {
    render(<SuperAdminSurveys />);
    await waitFor(() => expect(screen.getByText("Self-Signup Baseline")).toBeInTheDocument());
    expect(screen.getByText("Default · Global")).toBeInTheDocument();
    expect(screen.getByText("Concierge")).toBeInTheDocument();
    // First template auto-opens in the editor
    await waitFor(() =>
      expect(screen.getByText("Required — asked in every session")).toBeInTheDocument()
    );
  });

  it("groups questions into Required / Contextual / Retired with trend badges", async () => {
    render(<SuperAdminSurveys />);
    await waitFor(() =>
      expect(screen.getByText("NPS — likelihood to recommend")).toBeInTheDocument()
    );
    expect(screen.getByText("Contextual — AI asks at its discretion")).toBeInTheDocument();
    expect(screen.getByText("Retired — history preserved, not asked")).toBeInTheDocument();
    // Trend badge visible on the question with history
    expect(screen.getByText("4 rounds of data")).toBeInTheDocument();
    expect(screen.getByText("New — no history yet")).toBeInTheDocument();
    // Contextual trigger chips render
    expect(screen.getByText("responsiveness")).toBeInTheDocument();
    expect(screen.getByText("NPS ≤ 6")).toBeInTheDocument();
    // Retired question shows preserved-history note + Re-add
    expect(screen.getByText(/4 rounds of history preserved/)).toBeInTheDocument();
    expect(screen.getByText("Re-add")).toBeInTheDocument();
  });

  it("shows the retire modal when removal is answered 409 + suggestion retire", async () => {
    globalThis.fetch = mockFetch({});
    // Override DELETE to 409
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      if (opts.method === "DELETE") {
        return {
          ok: false,
          status: 409,
          headers: { get: () => "application/json" },
          json: async () => ({
            error: "This question has collected answers",
            suggestion: "retire",
          }),
        };
      }
      return baseFetch(url, opts);
    });

    render(<SuperAdminSurveys />);
    await waitFor(() =>
      expect(screen.getByText("NPS — likelihood to recommend")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText("Remove NPS — likelihood to recommend"));
    await waitFor(() => expect(screen.getByText(/has 4 rounds of trend data/)).toBeInTheDocument());
    expect(screen.getByText("Retire (keep history)")).toBeInTheDocument();
    expect(screen.getByText("Keep it")).toBeInTheDocument();
  });

  it("publish button reflects the next version number", async () => {
    render(<SuperAdminSurveys />);
    await waitFor(() => expect(screen.getByText("Publish v2")).toBeInTheDocument());
  });
});
