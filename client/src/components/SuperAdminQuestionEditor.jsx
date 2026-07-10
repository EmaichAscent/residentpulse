import { useState, useEffect, useMemo } from "react";

/**
 * Question editor modal (Zoho parity Phase C3 — the approved
 * question-editor mockup, live in the product).
 *
 * Form on the left, live respondent preview on the right — every
 * keystroke updates the exact chat bubble a board member would see.
 *
 * Trigger creation is plain English with a Test box that calls the
 * REAL classifier (/triggers/test), so what the operator sees here is
 * exactly what production will do — including which OTHER triggers
 * the sample message would fire (the design-time conflict callout).
 * Saving a trigger runs /triggers/overlap for the semantic-overlap
 * warning. Never blocks, always informs.
 *
 * Saving the question: POST /questions (code auto-assigned server-
 * side), then POST /templates/:id/questions with tier + triggers.
 */

const API = "/api/superadmin/surveys";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const ENTITY_OPTIONS = [
  { value: "company", label: "The company" },
  { value: "manager", label: "The assigned manager" },
  { value: "bookkeeper", label: "The assigned bookkeeper" },
  { value: "community", label: "The community" },
];

const FORMAT_OPTIONS = [
  { value: "likert5", label: "1–5 Likert" },
  { value: "nps", label: "NPS 0–10" },
  { value: "multi_select", label: "Multi-select" },
  { value: "yes_no", label: "Yes / No" },
  { value: "open_text", label: "Open text" },
];

function autoPhrasing(entity, label, format) {
  const l = (label || "this area").toLowerCase();
  if (format === "nps")
    return "On a scale of 0–10, how likely are you to recommend them to another board?";
  if (format === "multi_select") return "Which of these have you run into? Tap any that apply.";
  switch (entity) {
    case "manager":
      return `Quick read while we're on it — how is your manager handling ${l}?`;
    case "bookkeeper":
      return `On the financial side — how would you rate ${l}?`;
    case "community":
      return `Thinking about your community — how would you rate ${l}?`;
    default:
      return `Quick read while we're on it — how would you rate ${l}?`;
  }
}

export default function SuperAdminQuestionEditor({
  templateId,
  templateName,
  allTriggers,
  onSaved,
  onCancel,
}) {
  const [label, setLabel] = useState("");
  const [entity, setEntity] = useState("company");
  const [category, setCategory] = useState("");
  const [format, setFormat] = useState("likert5");
  const [low, setLow] = useState("Very poor");
  const [high, setHigh] = useState("Excellent");
  const [options, setOptions] = useState("");
  const [phrasing, setPhrasing] = useState("");
  const [tier, setTier] = useState("contextual");
  const [selectedTriggers, setSelectedTriggers] = useState([]);
  const [npsBand, setNpsBand] = useState("");
  const [triggers, setTriggers] = useState(allTriggers || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // New-trigger inline creator
  const [showNewTrigger, setShowNewTrigger] = useState(false);
  const [ntDesc, setNtDesc] = useState("");
  const [ntSample, setNtSample] = useState("");
  const [ntResult, setNtResult] = useState(null); // {fires, co_firing}
  const [ntTesting, setNtTesting] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState("");

  useEffect(() => setTriggers(allTriggers || []), [allTriggers]);

  const previewPhrasing = phrasing.trim() || autoPhrasing(entity, label, format);
  const optionList = useMemo(
    () =>
      options
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
    [options]
  );

  const testTrigger = async () => {
    if (!ntDesc.trim() || !ntSample.trim()) return;
    setNtTesting(true);
    setNtResult(null);
    try {
      const result = await api("/triggers/test", {
        method: "POST",
        body: { description: ntDesc.trim(), sample: ntSample.trim() },
      });
      setNtResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setNtTesting(false);
    }
  };

  const saveTrigger = async () => {
    if (!ntDesc.trim()) return;
    try {
      const shortLabel = ntDesc.length > 34 ? `${ntDesc.slice(0, 32)}…` : ntDesc;
      // Save-time overlap check — never blocks, always informs.
      const { overlaps } = await api("/triggers/overlap", {
        method: "POST",
        body: { description: ntDesc.trim() },
      }).catch(() => ({ overlaps: [] }));

      const created = await api("/triggers", {
        method: "POST",
        body: { label: shortLabel, description: ntDesc.trim() },
      });
      const newTrigger = { id: created.id, label: shortLabel, description: ntDesc.trim() };
      setTriggers((prev) => [...prev, newTrigger]);
      setSelectedTriggers((prev) => [...prev, created.id]);
      if (overlaps.length) {
        setOverlapWarning(
          `"${shortLabel}" overlaps with ${overlaps.map((o) => `"${o.label}"`).join(" and ")}. Only one contextual question fires per message — template order is the tiebreak. Consider merging triggers or reordering the template.`
        );
      }
      setShowNewTrigger(false);
      setNtDesc("");
      setNtSample("");
      setNtResult(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    if (!label.trim()) {
      setError("Question label is required.");
      return;
    }
    if (tier === "contextual" && selectedTriggers.length === 0) {
      setError("A contextual question needs at least one trigger — otherwise it can never fire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const format_config =
        format === "likert5"
          ? { low: low.trim() || "Very poor", high: high.trim() || "Excellent" }
          : format === "multi_select"
            ? { options: optionList }
            : null;

      const question = await api("/questions", {
        method: "POST",
        body: {
          label: label.trim(),
          category: category.trim() || null,
          entity_target: entity,
          answer_format: format,
          format_config,
          chat_phrasing: phrasing.trim() || null,
        },
      });

      if (templateId) {
        await api(`/templates/${templateId}/questions`, {
          method: "POST",
          body: {
            question_id: question.id,
            tier,
            nps_band_max: tier === "contextual" && npsBand ? Number(npsBand) : null,
            trigger_ids: tier === "contextual" ? selectedTriggers : [],
          },
        });
      }

      onSaved(question);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 920,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.2))",
        }}
        role="dialog"
        aria-label="New question"
      >
        {/* Header */}
        <div
          className="flex items-baseline"
          style={{ gap: 10, padding: "18px 24px", borderBottom: "1px solid var(--line)" }}
        >
          <h3 style={{ fontSize: 17, fontWeight: 650, color: "var(--ink)", margin: 0 }}>
            New question
          </h3>
          {templateName && (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              → adds to the library and to “{templateName}”
            </span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(340px, 1fr) minmax(280px, 360px)",
            gap: 0,
          }}
        >
          {/* ── Form ─────────────────────────────────────────────── */}
          <div style={{ padding: "20px 24px" }}>
            <Field label="Question label">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Vendor management effectiveness"
                style={inputStyle}
              />
              <Help>Shows in the builder, dashboards, and exports. Safe to rename later.</Help>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Rates">
                <select
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                  style={inputStyle}
                >
                  {ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category (optional)">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Vendor oversight"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Answer format">
              <div
                className="flex flex-wrap"
                style={{
                  gap: 4,
                  background: "var(--paper-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 3,
                  display: "inline-flex",
                }}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFormat(o.value)}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: "5px 12px",
                      borderRadius: 7,
                      border: "none",
                      cursor: "pointer",
                      background: format === o.value ? "white" : "transparent",
                      color: format === o.value ? "var(--ink)" : "var(--ink-3)",
                      boxShadow: format === o.value ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <Help>
                Locks after the first response is collected — a changed scale would poison trend
                lines. Everything else stays editable.
              </Help>
            </Field>

            {format === "likert5" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Low endpoint label">
                  <input
                    type="text"
                    value={low}
                    onChange={(e) => setLow(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="High endpoint label">
                  <input
                    type="text"
                    value={high}
                    onChange={(e) => setHigh(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}

            {format === "multi_select" && (
              <Field label="Options (one per line)">
                <textarea
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  rows={4}
                  placeholder={"Slow to bid work out\nPoor vendor quality"}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <Help>"None of these" is added automatically and clears other selections.</Help>
              </Field>
            )}

            <Field label="How the AI asks it (optional)">
              <textarea
                value={phrasing}
                onChange={(e) => setPhrasing(e.target.value)}
                rows={2}
                placeholder="Leave blank — the AI phrases it naturally from the label and conversation context."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <Field label="Delivery">
              <div className="flex" style={{ gap: 8 }}>
                {["required", "contextual"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: tier === t ? "1px solid var(--pulse)" : "1px solid var(--line)",
                      background: tier === t ? "var(--pulse-wash, #E8F5F1)" : "white",
                      color: tier === t ? "var(--pulse-deep)" : "var(--ink-3)",
                    }}
                  >
                    {t === "required" ? "Required — every session" : "Contextual — AI's discretion"}
                  </button>
                ))}
              </div>
            </Field>

            {tier === "contextual" && (
              <Field label="Fires when the conversation touches…">
                <div className="flex flex-wrap" style={{ gap: 6 }}>
                  {triggers.map((t) => {
                    const on = selectedTriggers.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        title={t.description}
                        onClick={() =>
                          setSelectedTriggers((prev) =>
                            on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                        style={{
                          fontSize: 12,
                          fontWeight: on ? 600 : 500,
                          padding: "5px 11px",
                          borderRadius: 999,
                          cursor: "pointer",
                          background: on ? "var(--pulse-wash, #E8F5F1)" : "white",
                          color: on ? "var(--pulse-deep)" : "var(--ink-3)",
                          border: on ? "1px solid var(--pulse)" : "1px dashed var(--line)",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowNewTrigger(true)}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "5px 11px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: "white",
                      color: "var(--pulse-deep)",
                      border: "1.5px dashed var(--pulse)",
                    }}
                  >
                    + New trigger
                  </button>
                </div>

                {showNewTrigger && (
                  <div
                    style={{
                      marginTop: 10,
                      background: "var(--paper-2)",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <Field label="Describe when this should fire — plain English">
                      <input
                        type="text"
                        value={ntDesc}
                        onChange={(e) => setNtDesc(e.target.value)}
                        placeholder="e.g. resident mentions gate, entry system, or security problems"
                        style={inputStyle}
                      />
                      <Help>
                        No keyword rules. The AI reads each resident message and decides if it
                        matches — the same classifier that runs in production.
                      </Help>
                    </Field>
                    <Field label="Test it against a sample message">
                      <div className="flex" style={{ gap: 8 }}>
                        <input
                          type="text"
                          value={ntSample}
                          onChange={(e) => setNtSample(e.target.value)}
                          placeholder='e.g. "the gate has been broken for three weeks"'
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn-ghost-sm"
                          onClick={testTrigger}
                          disabled={ntTesting}
                        >
                          {ntTesting ? "Testing…" : "Test"}
                        </button>
                      </div>
                      {ntResult && (
                        <div style={{ marginTop: 6, fontSize: 12.5 }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: ntResult.fires ? "var(--pulse-deep)" : "#B45309",
                            }}
                          >
                            {ntResult.fires
                              ? "✓ Your trigger fires on this message"
                              : "✗ Your trigger wouldn't fire — word the description closer to how residents talk"}
                          </span>
                          {ntResult.co_firing?.length > 0 && (
                            <div
                              style={{
                                marginTop: 5,
                                padding: "7px 10px",
                                background: "#FBF0E1",
                                border: "1px solid #E8C48A",
                                borderRadius: 8,
                                color: "var(--ink-2, #444)",
                              }}
                            >
                              ⚠ This message also fires:{" "}
                              {ntResult.co_firing.map((c) => `"${c.label}"`).join(", ")}. Only one
                              contextual question fires per message — template order decides.
                            </div>
                          )}
                        </div>
                      )}
                    </Field>
                    <div className="flex" style={{ gap: 8 }}>
                      <button type="button" className="btn-pulse-sm" onClick={saveTrigger}>
                        Add trigger
                      </button>
                      <button
                        type="button"
                        className="btn-ghost-sm"
                        onClick={() => {
                          setShowNewTrigger(false);
                          setNtResult(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {overlapWarning && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "9px 12px",
                      background: "#FBF0E1",
                      border: "1px solid #E8C48A",
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: "var(--ink-2, #444)",
                    }}
                  >
                    ⚠ {overlapWarning}{" "}
                    <button
                      type="button"
                      onClick={() => setOverlapWarning("")}
                      style={{
                        background: "none",
                        border: "none",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "var(--ink-3)",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    …and NPS is{" "}
                    <select
                      value={npsBand}
                      onChange={(e) => setNpsBand(e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: "3px 6px",
                        borderRadius: 6,
                        border: "1px solid var(--line)",
                      }}
                    >
                      <option value="">any score</option>
                      <option value="6">6 or below</option>
                      <option value="8">8 or below</option>
                    </select>
                  </label>
                </div>
              </Field>
            )}
          </div>

          {/* ── Live preview ─────────────────────────────────────── */}
          <div
            style={{
              background: "var(--paper-2)",
              borderLeft: "1px solid var(--line)",
              padding: 20,
            }}
          >
            <div
              className="font-bold uppercase flex justify-between items-baseline"
              style={{
                fontSize: 10,
                letterSpacing: "0.09em",
                color: "var(--ink-3)",
                marginBottom: 12,
              }}
            >
              <span>Respondent preview</span>
              <span style={{ color: "var(--pulse-deep)" }}>● Live</span>
            </div>

            <div
              style={{
                background: "white",
                border: "1px solid var(--line)",
                borderRadius: 16,
                borderBottomLeftRadius: 5,
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.45,
                color: "var(--ink)",
              }}
            >
              <span data-testid="preview-phrasing">{previewPhrasing}</span>
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px dashed var(--line)",
                }}
                data-testid="preview-widget"
              >
                {format === "likert5" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        style={{
                          background: "var(--paper-2)",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: "8px 3px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{n}</div>
                        <div style={{ fontSize: 8.5, color: "var(--ink-3)", minHeight: 10 }}>
                          {n === 1 ? low : n === 5 ? high : " "}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {format === "nps" && (
                  <>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 2 }}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            aspectRatio: "1",
                            background: "var(--paper-2)",
                            border: "1px solid var(--line)",
                            borderRadius: 6,
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--ink-3)",
                          }}
                        >
                          {i}
                        </div>
                      ))}
                    </div>
                    <div
                      className="flex justify-between"
                      style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 4 }}
                    >
                      <span>Not likely</span>
                      <span>Extremely likely</span>
                    </div>
                  </>
                )}
                {format === "multi_select" && (
                  <div className="flex flex-wrap" style={{ gap: 5 }}>
                    {[...optionList, "None of these"].map((o) => (
                      <span
                        key={o}
                        style={{
                          background: "var(--paper-2)",
                          border: "1px solid var(--line)",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 11.5,
                        }}
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                )}
                {format === "yes_no" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {["Yes", "No"].map((o) => (
                      <div
                        key={o}
                        style={{
                          background: "var(--paper-2)",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: 9,
                          textAlign: "center",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        {o}
                      </div>
                    ))}
                  </div>
                )}
                {format === "open_text" && (
                  <div
                    style={{
                      background: "var(--paper-2)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 12,
                      color: "var(--ink-3)",
                      fontStyle: "italic",
                      minHeight: 46,
                    }}
                  >
                    Type your answer…
                  </div>
                )}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textDecoration: "underline",
                }}
              >
                Prefer not to answer
              </div>
            </div>

            <p style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 12 }}>
              {tier === "required"
                ? "Asked in every session — woven in naturally when possible, or in the pre-wrap-up baseline batch. Skips are recorded."
                : selectedTriggers.length
                  ? `Fires only when the conversation matches ${selectedTriggers.length} trigger${selectedTriggers.length === 1 ? "" : "s"}${npsBand ? ` and NPS ≤ ${npsBand}` : ""}.`
                  : "⚠ No triggers selected — this question would never fire."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--line)",
            background: "var(--paper-2)",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Code auto-assigned on save (
            {entity === "company"
              ? "C"
              : entity === "manager"
                ? "M"
                : entity === "bookkeeper"
                  ? "F"
                  : "Y"}
            -series)
          </span>
          {error && (
            <span role="alert" style={{ fontSize: 12.5, color: "#9B2C2C", flex: 1 }}>
              {error}
            </span>
          )}
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="btn-ghost-sm" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn-pulse-sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : templateId ? "Save & add to template" : "Save to library"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  fontSize: 13.5,
  padding: "8px 11px",
  borderRadius: 9,
  border: "1px solid var(--line)",
  background: "white",
  color: "var(--ink)",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 650,
          color: "var(--ink)",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Help({ children }) {
  return (
    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}
