import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PromptVersionHistory from "./PromptVersionHistory";

const sampleVersions = [
  {
    id: 42,
    prompt_key: "interview_initial_prompt",
    prompt_text: "older content",
    label: "Tightened Phase 2 wording",
    created_by: "mike@camascent.com",
    created_at: "2026-04-29T10:00:00Z",
  },
  {
    id: 41,
    prompt_key: "interview_initial_prompt",
    prompt_text: "even older content",
    label: "Auto-save",
    created_by: "mike@camascent.com",
    created_at: "2026-04-28T10:00:00Z",
  },
];

describe("PromptVersionHistory", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/prompt/versions") && !url.includes("/restore")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sampleVersions),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads versions for the given promptKey", async () => {
    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current"
        onLoadVersion={() => {}}
      />
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/superadmin/prompt/versions?key=interview_initial_prompt",
        expect.objectContaining({ credentials: "include" })
      );
    });
  });

  it("renders each version with its label and metadata", async () => {
    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current"
        onLoadVersion={() => {}}
      />
    );

    expect(await screen.findByText("Tightened Phase 2 wording")).toBeInTheDocument();
    expect(screen.getByText("Auto-save")).toBeInTheDocument();
    // count badge
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("calls onLoadVersion with the version's text when Load is clicked", async () => {
    const onLoadVersion = vi.fn();
    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current"
        onLoadVersion={onLoadVersion}
      />
    );

    await screen.findByText("Tightened Phase 2 wording");
    const loadButtons = screen.getAllByText("Load");
    fireEvent.click(loadButtons[0]);
    expect(onLoadVersion).toHaveBeenCalledWith("older content");
  });

  it("opens a restore confirmation modal when Restore is clicked", async () => {
    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current"
        onLoadVersion={() => {}}
      />
    );

    await screen.findByText("Tightened Phase 2 wording");
    const restoreButtons = screen.getAllByText("Restore");
    fireEvent.click(restoreButtons[0]);

    expect(screen.getByText(/Restore this version/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-saved as a new version first/i)).toBeInTheDocument();
  });

  it("shows the save-as-version input when 'Save current as version' is clicked", async () => {
    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current text"
        onLoadVersion={() => {}}
      />
    );

    await screen.findByText("Tightened Phase 2 wording");
    fireEvent.click(screen.getByText("Save current as version"));

    expect(screen.getByPlaceholderText(/Label/i)).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows 'No saved versions yet' when the list is empty", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    render(
      <PromptVersionHistory
        promptKey="interview_initial_prompt"
        currentText="current"
        onLoadVersion={() => {}}
      />
    );

    expect(await screen.findByText("No saved versions yet.")).toBeInTheDocument();
  });
});
