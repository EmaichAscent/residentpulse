import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TypedConfirmModal from "./TypedConfirmModal";

const baseProps = {
  isOpen: true,
  onClose: () => {},
  onConfirm: () => {},
  title: "Reset Southern States",
  message: "This will delete all rounds. Cannot be undone.",
  confirmPhrase: "SOUTHERN STATES",
};

describe("TypedConfirmModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(<TypedConfirmModal {...baseProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders title, message, and the phrase the user must type", () => {
    render(<TypedConfirmModal {...baseProps} />);
    expect(screen.getByText("Reset Southern States")).toBeInTheDocument();
    expect(screen.getByText(/This will delete all rounds/)).toBeInTheDocument();
    expect(screen.getByText("SOUTHERN STATES")).toBeInTheDocument();
  });

  it("disables the confirm button until the phrase matches verbatim", () => {
    render(<TypedConfirmModal {...baseProps} confirmLabel="Reset" />);
    const confirm = screen.getByRole("button", { name: "Reset" });
    expect(confirm).toBeDisabled();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "southern states" } });
    expect(confirm).toBeDisabled(); // case-sensitive

    fireEvent.change(input, { target: { value: "SOUTHERN STATES" } });
    expect(confirm).not.toBeDisabled();
  });

  it("ignores leading/trailing whitespace when matching", () => {
    render(<TypedConfirmModal {...baseProps} confirmLabel="Reset" />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   SOUTHERN STATES  " } });
    expect(screen.getByRole("button", { name: "Reset" })).not.toBeDisabled();
  });

  it("calls onConfirm only when phrase matches and button is clicked", () => {
    const onConfirm = vi.fn();
    render(<TypedConfirmModal {...baseProps} onConfirm={onConfirm} confirmLabel="Reset" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SOUTHERN STATES" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<TypedConfirmModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables both buttons while loading", () => {
    render(<TypedConfirmModal {...baseProps} loading={true} confirmLabel="Reset" />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Please wait...")).toBeDisabled();
  });

  it("resets the typed value when modal closes and reopens", () => {
    const { rerender } = render(<TypedConfirmModal {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SOUTHERN STATES" } });
    expect(screen.getByRole("textbox").value).toBe("SOUTHERN STATES");

    rerender(<TypedConfirmModal {...baseProps} isOpen={false} />);
    rerender(<TypedConfirmModal {...baseProps} isOpen={true} />);

    expect(screen.getByRole("textbox").value).toBe("");
  });
});
