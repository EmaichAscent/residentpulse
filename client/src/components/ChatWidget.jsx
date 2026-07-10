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

export default function ChatWidget({ payload, disabled, onAnswer, onSkip }) {
  const [selections, setSelections] = useState([]); // multi_select
  const [text, setText] = useState(""); // open_text
  const [submitting, setSubmitting] = useState(false);

  const cfg = payload.format_config || {};

  const submit = async (value) => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try {
      await onAnswer(value);
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSkip();
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
    transition: "border-color 120ms ease, background 120ms ease",
  };

  return (
    <div style={{ marginTop: 8 }} data-testid={`chat-widget-${payload.code}`}>
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
                style={{
                  ...btnBase,
                  aspectRatio: "1",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
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
              style={{
                ...btnBase,
                borderRadius: 10,
                padding: "9px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700 }}>{n}</span>
              <span style={{ fontSize: 9.5, color: "var(--ink-3)", minHeight: 12 }}>
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
            {selections.length ? `Submit ${selections.length} selected` : "None of these"}
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
              style={{
                ...btnBase,
                borderRadius: 10,
                padding: 10,
                fontSize: 13.5,
                fontWeight: 600,
                textAlign: "center",
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
            Submit
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
            color: "var(--ink-3)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            cursor: submitting || disabled ? "default" : "pointer",
          }}
        >
          Prefer not to answer
        </button>
      </div>
    </div>
  );
}
