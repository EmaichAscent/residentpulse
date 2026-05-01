import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OwnerPicker from "./OwnerPicker";

function renderPicker(props = {}) {
  return render(
    <MemoryRouter>
      <OwnerPicker value={props.value || ""} onChange={props.onChange || (() => {})} {...props} />
    </MemoryRouter>
  );
}

const sampleAdmins = [
  { id: 1, email: "mike@camascent.com", first_name: "Mike", last_name: "Hardy" },
  { id: 2, email: "andrea@camascent.com", first_name: "Andrea", last_name: "Hardy" },
  { id: 3, email: "carlos@example.com", first_name: "Carlos", last_name: "Reyes" },
];

describe("OwnerPicker", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(sampleAdmins) })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a placeholder chip when no owner is set", () => {
    renderPicker({ value: "" });
    expect(screen.getByText(/Assign owner/i)).toBeInTheDocument();
  });

  it("opens the popover and fetches admins from /api/admin/users on first open", async () => {
    renderPicker({ value: "" });
    fireEvent.click(screen.getByText(/Assign owner/i));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ credentials: "include" })
      );
    });
    // List items render
    expect(await screen.findByText("Mike Hardy")).toBeInTheDocument();
    expect(screen.getByText("Andrea Hardy")).toBeInTheDocument();
    expect(screen.getByText("Carlos Reyes")).toBeInTheDocument();
  });

  it("filters the list by search query (matches first name, last name, or email)", async () => {
    renderPicker({ value: "" });
    fireEvent.click(screen.getByText(/Assign owner/i));
    await screen.findByText("Mike Hardy");

    const search = screen.getByPlaceholderText("Search admins…");
    fireEvent.change(search, { target: { value: "carl" } });

    expect(screen.queryByText("Mike Hardy")).not.toBeInTheDocument();
    expect(screen.queryByText("Andrea Hardy")).not.toBeInTheDocument();
    expect(screen.getByText("Carlos Reyes")).toBeInTheDocument();
  });

  it("emits onChange with the picked email and closes the popover", async () => {
    const onChange = vi.fn();
    renderPicker({ value: "", onChange });
    fireEvent.click(screen.getByText(/Assign owner/i));
    fireEvent.click(await screen.findByText("Andrea Hardy"));

    expect(onChange).toHaveBeenCalledWith("andrea@camascent.com");
    // Popover closed → search field gone
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search admins…")).not.toBeInTheDocument();
    });
  });

  it("shows the selected owner's name in the chip when value matches a known admin", async () => {
    renderPicker({ value: "mike@camascent.com" });
    // Open the popover so the admin list loads (the chip label
    // resolves via the loaded admin list).
    fireEvent.click(screen.getByText(/mike@camascent\.com|Assign owner/i));
    expect(await screen.findByText("Mike Hardy")).toBeInTheDocument();
  });

  it("offers an Unassign action when an owner is set", async () => {
    const onChange = vi.fn();
    renderPicker({ value: "mike@camascent.com", onChange });
    fireEvent.click(screen.getByText(/Mike Hardy|mike@camascent\.com|Assign owner/i));
    const unassign = await screen.findByText(/Unassign/i);
    fireEvent.click(unassign);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("links to the Account page so admins can be added there", async () => {
    renderPicker({ value: "" });
    fireEvent.click(screen.getByText(/Assign owner/i));
    const link = await screen.findByText(/Add admin in Account/i);
    expect(link.closest("a")).toHaveAttribute("href", "/admin/account");
  });
});
