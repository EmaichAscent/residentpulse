import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TestInterviewModal from "./TestInterviewModal";

describe("TestInterviewModal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(<TestInterviewModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title with the client name and the four personas", () => {
    render(
      <TestInterviewModal
        isOpen={true}
        onClose={() => {}}
        clientName="Southern States Management Group"
      />
    );

    expect(
      screen.getByText(/Test interview · Southern States Management Group/)
    ).toBeInTheDocument();
    // Three of the four persona names appear once (left-rail card only).
    // "Frustrated passive" is the default-selected persona so it ALSO appears
    // in the center column header — using getAllByText for it.
    expect(screen.getByText("Vague promoter")).toBeInTheDocument();
    expect(screen.getAllByText("Frustrated passive").length).toBeGreaterThan(0);
    expect(screen.getByText("Angry detractor")).toBeInTheDocument();
    expect(screen.getByText("Silent detractor (legal-risk)")).toBeInTheDocument();
  });

  it("starts with Frustrated Passive as the default selected persona", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Board President · Aspen Heights")).toBeInTheDocument();
  });

  it("changes the active persona when one is clicked", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Vague promoter"));
    expect(screen.getByText("Board Treasurer · Magnolia Pointe")).toBeInTheDocument();
  });

  it("shows the empty-state hint before Run is clicked", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/scripted response/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run interview/i })).toBeInTheDocument();
  });

  it("starts the playback when Run is clicked", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Run interview/i }));
    // First message renders after 200ms
    act(() => {
      vi.advanceTimersByTime(250);
    });
    // The first AI line for Frustrated Passive starts with "Thanks for taking a few minutes..."
    expect(screen.getByText(/Thanks for taking a few minutes/)).toBeInTheDocument();
  });

  it("plays through the full transcript when Run is clicked, surfacing critique annotations", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Run interview/i }));

    // Advance time in 1s chunks so React commits a re-render between each
    // setTimeout firing — a single big advance won't drain effect-scheduled
    // timers reliably under jsdom + fake timers.
    for (let i = 0; i < 20; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // After 20s, the entire 13-step Frustrated Passive transcript has played.
    expect(screen.getByText(/Let me push on that/)).toBeInTheDocument();
    expect(screen.getByText(/Anti-abstraction rule firing/i)).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("substitutes [CLIENT_NAME] with the provided clientName in transcripts", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} clientName="Acme PM, Inc." />);
    fireEvent.click(screen.getByRole("button", { name: /Run interview/i }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    // First message of Frustrated Passive contains the client name token
    expect(screen.getByText(/Acme PM, Inc\./)).toBeInTheDocument();
    expect(screen.queryByText(/\[CLIENT_NAME\]/)).not.toBeInTheDocument();
  });

  it("Restart resets the transcript and stops playback", () => {
    render(<TestInterviewModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Run interview/i }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/Thanks for taking a few minutes/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Restart/i }));
    expect(screen.queryByText(/Thanks for taking a few minutes/)).not.toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    render(<TestInterviewModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
