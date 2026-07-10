import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SuperAdminQuestionEditor from "./SuperAdminQuestionEditor";

const TRIGGERS = [
  { id: 1, label: "responsiveness", description: "slow responses" },
  { id: 2, label: "vendor issues", description: "vendor problems" },
];

function mockFetch(handlers = {}) {
  return vi.fn(async (url, opts = {}) => {
    const respond = (data, status = 200) => ({
      ok: status < 400,
      status,
      json: async () => data,
    });
    const key = `${opts.method || "GET"} ${url}`;
    if (handlers[key]) return handlers[key](opts);
    return respond({}, 404);
  });
}

beforeEach(() => {
  globalThis.fetch = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderEditor(props = {}) {
  return render(
    <SuperAdminQuestionEditor
      templateId={1}
      templateName="Cadden — Board Survey"
      allTriggers={TRIGGERS}
      onSaved={props.onSaved || vi.fn()}
      onCancel={props.onCancel || vi.fn()}
      {...props}
    />
  );
}

describe("SuperAdminQuestionEditor", () => {
  it("live preview follows the label as you type", () => {
    renderEditor();
    const input = screen.getByPlaceholderText("e.g. Vendor management effectiveness");
    fireEvent.change(input, { target: { value: "Snow removal quality" } });
    expect(screen.getByTestId("preview-phrasing").textContent).toMatch(/snow removal quality/);
  });

  it("switching answer format swaps the preview widget and its config", () => {
    renderEditor();
    // Default likert shows endpoint config
    expect(screen.getByText("Low endpoint label")).toBeInTheDocument();
    // Switch to multi-select
    fireEvent.click(screen.getByText("Multi-select"));
    expect(screen.getByText("Options (one per line)")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Slow to bid work out/), {
      target: { value: "Late reports\nWrong numbers" },
    });
    expect(screen.getByText("Late reports")).toBeInTheDocument();
    expect(screen.getByText("None of these")).toBeInTheDocument();
  });

  it("custom chat phrasing overrides the auto phrasing in the preview", () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText(/Leave blank — the AI phrases it naturally/), {
      target: { value: "How happy are you with snow removal this season?" },
    });
    expect(screen.getByTestId("preview-phrasing").textContent).toBe(
      "How happy are you with snow removal this season?"
    );
  });

  it("contextual with no triggers warns and blocks save", async () => {
    renderEditor();
    expect(
      screen.getByText(/No triggers selected — this question would never fire/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("e.g. Vendor management effectiveness"), {
      target: { value: "Test question" },
    });
    fireEvent.click(screen.getByText("Save & add to template"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/needs at least one trigger/)
    );
  });

  it("trigger Test box calls the real endpoint and shows co-firing conflicts", async () => {
    globalThis.fetch = mockFetch({
      "POST /api/superadmin/surveys/triggers/test": async () => ({
        ok: true,
        status: 200,
        json: async () => ({ fires: true, co_firing: [{ id: 2, label: "vendor issues" }] }),
      }),
    });
    renderEditor();
    fireEvent.click(screen.getByText("+ New trigger"));
    fireEvent.change(screen.getByPlaceholderText(/resident mentions gate/), {
      target: { value: "resident mentions landscaping problems" },
    });
    fireEvent.change(screen.getByPlaceholderText(/the gate has been broken/), {
      target: { value: "the landscaper keeps skipping our street" },
    });
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() =>
      expect(screen.getByText(/Your trigger fires on this message/)).toBeInTheDocument()
    );
    expect(screen.getByText(/This message also fires/)).toBeInTheDocument();
    expect(screen.getByText(/"vendor issues"/)).toBeInTheDocument();
  });

  it("saves the question then adds it to the template", async () => {
    const calls = [];
    globalThis.fetch = mockFetch({
      "POST /api/superadmin/surveys/questions": async (opts) => {
        calls.push(["questions", JSON.parse(opts.body)]);
        return { ok: true, status: 200, json: async () => ({ id: 77, code: "C13" }) };
      },
      "POST /api/superadmin/surveys/templates/1/questions": async (opts) => {
        calls.push(["template-add", JSON.parse(opts.body)]);
        return { ok: true, status: 200, json: async () => ({ id: 55 }) };
      },
    });
    const onSaved = vi.fn();
    renderEditor({ onSaved });
    fireEvent.change(screen.getByPlaceholderText("e.g. Vendor management effectiveness"), {
      target: { value: "Snow removal quality" },
    });
    fireEvent.click(screen.getByText("Required — every session"));
    fireEvent.click(screen.getByText("Save & add to template"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 77, code: "C13" }));
    expect(calls[0][1].label).toBe("Snow removal quality");
    expect(calls[1][1]).toMatchObject({ question_id: 77, tier: "required" });
  });
});
