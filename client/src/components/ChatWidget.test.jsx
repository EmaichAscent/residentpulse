import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatWidget from "./ChatWidget";

const LIKERT = {
  question_id: 7,
  code: "M04",
  label: "Responsive",
  answer_format: "likert5",
  format_config: { low: "Very poor", high: "Excellent" },
  gate: true,
};

describe("ChatWidget", () => {
  it("likert renders 5 cells with endpoint labels and submits the tapped value", async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(<ChatWidget payload={LIKERT} onAnswer={onAnswer} onSkip={vi.fn()} />);
    expect(screen.getByText("Very poor")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Rate 2 of 5"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(2));
  });

  it("nps renders 0–10 and submits the tapped score", async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(
      <ChatWidget
        payload={{ ...LIKERT, code: "Q001", answer_format: "nps", format_config: null }}
        onAnswer={onAnswer}
        onSkip={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("Score 6"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(6));
  });

  it("multi-select accumulates selections and submits them together", async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(
      <ChatWidget
        payload={{
          ...LIKERT,
          code: "M14",
          answer_format: "multi_select",
          format_config: { options: ["Defensive", "Missing prep", "Slow email"] },
        }}
        onAnswer={onAnswer}
        onSkip={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Defensive"));
    fireEvent.click(screen.getByText("Slow email"));
    fireEvent.click(screen.getByText("Submit 2 selected"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(["Defensive", "Slow email"]));
  });

  it("multi-select with nothing selected submits an empty list ('None of these')", async () => {
    const onAnswer = vi.fn().mockResolvedValue();
    render(
      <ChatWidget
        payload={{
          ...LIKERT,
          answer_format: "multi_select",
          format_config: { options: ["A"] },
        }}
        onAnswer={onAnswer}
        onSkip={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("None of these"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith([]));
  });

  it("skip link is always present and calls onSkip", async () => {
    const onSkip = vi.fn().mockResolvedValue();
    render(<ChatWidget payload={LIKERT} onAnswer={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("Prefer not to answer"));
    await waitFor(() => expect(onSkip).toHaveBeenCalled());
  });

  it("disabled widgets don't submit", () => {
    const onAnswer = vi.fn();
    render(<ChatWidget payload={LIKERT} disabled onAnswer={onAnswer} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Rate 3 of 5"));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("the tapped score highlights INSTANTLY, before the answer round-trip resolves", async () => {
    // The record + AI-reaction round-trip takes a second or two;
    // without an immediate cue residents re-tap because they can't
    // tell the first tap landed.
    let resolveAnswer;
    const onAnswer = vi.fn(() => new Promise((r) => (resolveAnswer = r)));
    render(<ChatWidget payload={LIKERT} onAnswer={onAnswer} onSkip={vi.fn()} />);
    const cell = screen.getByLabelText("Rate 3 of 5");
    fireEvent.click(cell);
    // Highlight is synchronous with the tap — the promise is still pending
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Rate 2 of 5")).toHaveAttribute("aria-pressed", "false");
    resolveAnswer(true);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(3));
    // Success: the highlight stays as the record of what they chose
    expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it("a failed submit clears the highlight so the resident knows to retry", async () => {
    const onAnswer = vi.fn().mockResolvedValue(false); // answerWidget's failure signal
    render(<ChatWidget payload={LIKERT} onAnswer={onAnswer} onSkip={vi.fn()} />);
    const cell = screen.getByLabelText("Rate 4 of 5");
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(cell).toHaveAttribute("aria-pressed", "false"));
  });

  it("a second tap during the round-trip is ignored — no double submits", async () => {
    let resolveAnswer;
    const onAnswer = vi.fn(() => new Promise((r) => (resolveAnswer = r)));
    render(<ChatWidget payload={LIKERT} onAnswer={onAnswer} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Rate 3 of 5"));
    fireEvent.click(screen.getByLabelText("Rate 3 of 5"));
    fireEvent.click(screen.getByLabelText("Rate 5 of 5"));
    resolveAnswer(true);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
  });

  it("the skip link shows its own in-flight state", async () => {
    let resolveSkip;
    const onSkip = vi.fn(() => new Promise((r) => (resolveSkip = r)));
    render(<ChatWidget payload={LIKERT} onAnswer={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("Prefer not to answer"));
    expect(screen.getByText("Skipping…")).toBeInTheDocument();
    resolveSkip(true);
    await waitFor(() => expect(onSkip).toHaveBeenCalled());
  });
});
