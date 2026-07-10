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
});
