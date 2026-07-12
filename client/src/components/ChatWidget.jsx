import { useState } from "react";

/**
 * Structured survey widget rendered inside the chat (Zoho parity
 * Phase D1 — the respondent side of the hybrid survey).
 *
 * Renders from a `widget` message's payload: {question_id, code,
 * label, answer_format, format_config, gate}. Interactive until
 * answered/skipped, then the parent stops rendering it as live (the
 * widget_answer message that follows carries the record).
 *
 * "Prefer not to answer" is always available — a skip is a real
 * recorded data point, and it beats abandonment.
 */

const SKIP = "__skip__";

export default function ChatWidget({ payload, disabled, onAnswer, onSkip }) {
  const [selections, setSelections] = useState([]); // multi_select
  const [text, setText] = useState(""); // open_text
  const [submitting, setSubmitting] = useState(false);
  // The tapped value, highlighted the INSTANT it's tapped — the answer
  // round-trip (record + AI reaction) takes a second or two, and
  // without an immediate cue residents re-tap because they can't tell
  // it went through. Cleared only if the submit explicitly failed
  // (onAnswer/onSkip return false) so they know to try again.
  const [selected, setSelected] = useState(null);

  const cfg = payload.format_config || {};

  const submit = async (value) => {
    if (submitting || disabled) return;
    setSelected(value);
    setSubmitting(true);
    try {
      const ok = await onAnswer(value);
      if (ok === false) setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    if (submitting || disabled) return;
    setSelected(SKIP);
    setSubmitting(true);
    try {
      const ok = await onSkip();
      if (ok === false) setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  const btnBase = {
    fontFamily: "inherit",
    cursor: submitting || disabled ? "default" : "pointer",
    opacity: submitting || disabled ? 0.55 : 1,
    border: "1px solid var(--line)",
    background: "white",
    color: "var(--ink)",
    transition: "border-color 120ms ease, background 120ms ease, opacity 120ms ease",
  };

  // The tapped cell fills solid and holds full strength while the rest
  // of the scale recedes — one glance says "your tap landed".
  const choiceStyle = (value) =>
    selected !== null && selected === value
      ? { background: "var(--pulse)", borderColor: "var(--pulse)", color: "white", opacity: 1 }
      : selected !== null
        ? { opacity: 0.35 }
        : {};

  return (
    <div style={{ marginTop: 8 }} data-testid={`chat-widget-${payload.code}`}>
      {/* The question label is the widget's caption — the bubble text
          above is a conversational lead-in that never embeds the label
          (labels are noun phrases; embedding them reads robotic). */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
          marginBottom: 6,
        }}
      >
        {payload.label}
      </div>
      {payload.answer_format === "nps" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 3 }}>
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={submitting || disabled}
                onClick={() => submit(i)}
                aria-label={`Score ${i}`}
                aria-pressed={selected === i}
                style={{
                  ...btnBase,
                  aspectRatio: "1",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  ...choiceStyle(i),
                }}
              >
                {i}
              </button>
            ))}
          </div>
          <div
            className="flex justify-between"
            style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 5 }}
          >
            <span>Not likely</span>
            <span>Extremely likely</span>
          </div>
        </>
      )}

      {payload.answer_format === "likert5" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={submitting || disabled}
              onClick={() => submit(n)}
              aria-label={`Rate ${n} of 5`}
              aria-pressed={selected === n}
              style={{
                ...btnBase,
                borderRadius: 10,
                padding: "9px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                ...choiceStyle(n),
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700 }}>{n}</span>
              <span
                style={{
                  fontSize: 9.5,
                  color: selected === n ? "rgba(255,255,255,0.85)" : "var(--ink-3)",
                  minHeight: 12,
                }}
              >
                {n === 1 ? cfg.low || "" : n === 5 ? cfg.high || "" : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {payload.answer_format === "multi_select" && (
        <>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {(cfg.options || []).map((o) => {
              const on = selections.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={submitting || disabled}
                  onClick={() =>
                    setSelections((prev) => (on ? prev.filter((s) => s !== o) : [...prev, o]))
                  }
                  style={{
                    ...btnBase,
                    borderRadius: 999,
                    padding: "6px 13px",
                    fontSize: 13,
                    fontWeight: on ? 600 : 500,
                    background: on ? "var(--pulse-wash, #E8F5F1)" : "white",
                    borderColor: on ? "var(--pulse)" : "var(--line)",
                    color: on ? "var(--pulse-deep)" : "var(--ink)",
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={submitting || disabled}
            onClick={() => submit(selections)}
            className="btn-pulse-sm"
            style={{ marginTop: 8 }}
          >
            {submitting
              ? "Sending…"
              : selections.length
                ? `Submit ${selections.length} selected`
                : "None of these"}
          </button>
        </>
      )}

      {payload.answer_format === "yes_no" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxWidth: 240 }}>
          {[
            { label: "Yes", value: true },
            { label: "No", value: false },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={submitting || disabled}
              onClick={() => submit(o.value)}
              aria-pressed={selected === o.value}
              style={{
                ...btnBase,
                borderRadius: 10,
                padding: 10,
                fontSize: 13.5,
                fontWeight: 600,
                textAlign: "center",
                ...choiceStyle(o.value),
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {payload.answer_format === "open_text" && (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            disabled={submitting || disabled}
            placeholder="Type your answer…"
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: 13.5,
              padding: "8px 11px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              resize: "vertical",
            }}
          />
          <button
            type="button"
            className="btn-pulse-sm"
            disabled={submitting || disabled || !text.trim()}
            onClick={() => submit(text.trim())}
            style={{ marginTop: 6 }}
          >
            {submitting ? "Sending…" : "Submit"}
          </button>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={skip}
          disabled={submitting || disabled}
          style={{
            marginTop: 8,
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
            fontSize: 12,
            color: selected === SKIP ? "var(--ink)" : "var(--ink-3)",
            fontWeight: selected === SKIP ? 600 : 400,
            textDecoration: "underline",
            textUnderlineOffset: 2,
            cursor: submitting || disabled ? "default" : "pointer",
          }}
        >
          {selected === SKIP && submitting ? "Skipping…" : "Prefer not to answer"}
        </button>
      </div>
    </div>
  );
}
