import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SurveyData from "./SurveyData";

const QUESTIONS = [
  {
    question_id: 1,
    code: "C03",
    label: "Overall communication",
    category: "Company service",
    entity_target: "company",
    answer_format: "likert5",
    rounds: [
      { round_id: 10, round_number: 1, avg: 4.2, answered: 5, skipped: 0, delta_counts: {} },
      { round_id: 11, round_number: 2, avg: 3.7, answered: 4, skipped: 1, delta_counts: {} },
    ],
  },
  {
    question_id: 3,
    code: "F01",
    label: "Financial report accuracy",
    category: "Financials",
    entity_target: "bookkeeper",
    answer_format: "likert5",
    rounds: [
      {
        round_id: 10,
        round_number: 1,
        avg: null,
        answered: 4,
        skipped: 0,
        delta_counts: { Declined: 4 },
      },
    ],
  },
];

const MANAGERS = [
  {
    id: 21,
    name: "Debbie Tolton",
    status: "active",
    community_count: 8,
    rated_answers: 42,
    overall_avg: 4.2,
    rounds: [
      { round_id: 10, round_number: 1, avg: 4.4, rated: 20 },
      { round_id: 11, round_number: 2, avg: 4.0, rated: 22 },
    ],
  },
];

beforeEach(() => {
  globalThis.fetch = vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (url.includes("/questions")) return QUESTIONS;
      if (url.includes("type=managers")) return MANAGERS;
      return [];
    },
  }));
});

afterEach(() => vi.restoreAllMocks());

describe("SurveyData", () => {
  it("groups questions by category with latest average and skip counts", async () => {
    render(<SurveyData />);
    await waitFor(() => expect(screen.getByText("Overall communication")).toBeInTheDocument());
    expect(screen.getByText("Company service")).toBeInTheDocument();
    expect(screen.getByText("Financials")).toBeInTheDocument();
    // Latest average + trend arrow (4.2 → 3.7 = down 0.5)
    expect(screen.getByText("3.7")).toBeInTheDocument();
    expect(screen.getByText(/▼/)).toBeInTheDocument();
    // Skip count surfaces
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    // Zoho delta-era question renders its mode, not a fake average
    expect(screen.getByText("delta-era only")).toBeInTheDocument();
    expect(screen.getByText(/includes Zoho-era delta ratings/)).toBeInTheDocument();
  });

  it("People tab shows per-manager rollups", async () => {
    render(<SurveyData />);
    await waitFor(() => expect(screen.getByText("Overall communication")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(screen.getByText("Debbie Tolton")).toBeInTheDocument();
    expect(screen.getByText(/8 active communities/)).toBeInTheDocument();
    expect(screen.getByText(/42 rated answers/)).toBeInTheDocument();
    expect(screen.getByText("4.2")).toBeInTheDocument();
  });

  it("empty state explains where data comes from", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    render(<SurveyData />);
    await waitFor(() => expect(screen.getByText(/No structured answers yet/)).toBeInTheDocument());
  });
});
