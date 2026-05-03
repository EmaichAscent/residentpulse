import { useState, useEffect, useRef } from "react";
import { TEST_PERSONAS } from "../data/testInterviewPersonas";

/**
 * SuperAdminTestInterview — scripted "test interview" runner. PR 5 of
 * the SuperAdmin overhaul, per handoff §6.
 *
 * The whole point of the modal is to make prompt changes OBSERVABLE
 * before they go live to real boards. Operator picks one of four
 * scripted personas, hits Run, and watches the AI's response play
 * back at conversational cadence with annotations in the right rail
 * showing which prompt rule fired on each AI message.
 *
 * v0 ships scripted (no live LLM call) per the handoff §"What NOT to
 * ship in v1" — the rule-fired annotations are the value, not real
 * inference. v2 can swap in actual model streaming later.
 *
 * Three columns:
 *   left  (260px) — persona picker
 *   middle (flex) — chat transcript with run / restart controls
 *   right (320px paper-2) — critique panel (rule-fired annotations)
 *
 * Triggered from the SuperAdmin Prompts Library page header (PR 5
 * wiring). Per handoff §6, will also be reachable from individual
 * Client detail pages once PR 6 lands the Client Detail tabs.
 */

const PLAYBACK_MS = 950; // handoff §6 cadence

export default function SuperAdminTestInterview({ open, onClose }) {
  const [activeId, setActiveId] = useState(TEST_PERSONAS[0].id);
  const [step, setStep] = useState(0); // how many transcript rows are visible
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);

  const persona = TEST_PERSONAS.find((p) => p.id === activeId);
  const transcript = persona?.transcript || [];
  const visibleRows = transcript.slice(0, step);
  const finished = step >= transcript.length;

  // Reset everything when the modal opens or the persona changes.
  useEffect(() => {
    setStep(0);
    setRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [activeId, open]);

  // Playback loop — advance one row per PLAYBACK_MS while running and
  // not at the end.
  useEffect(() => {
    if (!running) return;
    if (finished) {
      setRunning(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setStep((s) => s + 1);
    }, PLAYBACK_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running, step, finished]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const handleRun = () => {
    if (finished) {
      setStep(0); // restart implicitly if already done
    }
    setRunning(true);
  };

  const handleRestart = () => {
    setRunning(false);
    setStep(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,27,43,0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 1100,
          width: "100%",
          height: "92vh",
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <div>
            <h3
              className="font-medium"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 19,
                letterSpacing: "-0.015em",
                color: "var(--ink)",
              }}
            >
              Test interview
            </h3>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
              Scripted persona runs. The right rail shows which prompt rule fired on each AI message
              — if a rule annotation drops out, the prompt edit broke that rule.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md transition"
            style={{
              padding: 6,
              color: "var(--ink-4)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            aria-label="Close test interview"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body — three columns */}
        <div className="flex" style={{ flex: 1, minHeight: 0 }}>
          {/* Left rail — persona picker */}
          <div
            style={{
              width: 260,
              borderRight: "1px solid var(--line)",
              overflowY: "auto",
              padding: "12px 12px",
              flexShrink: 0,
            }}
          >
            <SectionEyebrow>Pick a persona</SectionEyebrow>
            <div className="flex flex-col mt-2" style={{ gap: 8 }}>
              {TEST_PERSONAS.map((p) => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  active={p.id === activeId}
                  onClick={() => setActiveId(p.id)}
                />
              ))}
            </div>
          </div>

          {/* Middle — chat transcript */}
          <div className="flex flex-col" style={{ flex: 1, minWidth: 0, background: "white" }}>
            <div
              className="flex items-center justify-between"
              style={{
                padding: "10px 18px",
                borderBottom: "1px solid var(--line)",
                flexShrink: 0,
                background: "var(--paper)",
              }}
            >
              <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                <strong style={{ color: "var(--ink)" }}>{persona.name}</strong> · {persona.role}
                {" · "}
                <span className="font-mono">NPS {persona.score}</span>
              </div>
              <div className="flex items-center gap-2">
                {running && (
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: "var(--pulse-soft)",
                      color: "var(--pulse-deep)",
                      padding: "3px 8px",
                      borderRadius: 999,
                      letterSpacing: "0.08em",
                    }}
                  >
                    Running…
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={running}
                  style={ghostBtnStyle}
                >
                  Restart
                </button>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={running && !finished}
                  style={primaryBtnStyle}
                >
                  {finished ? "Run again" : running ? "Running…" : "Run interview"}
                </button>
              </div>
            </div>

            <div
              className="flex flex-col"
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 20px",
                gap: 12,
              }}
            >
              {step === 0 && !running && (
                <p
                  className="text-[12.5px] text-center"
                  style={{ color: "var(--ink-4)", marginTop: 60 }}
                >
                  Click <strong>Run interview</strong> to play back the scripted transcript.
                </p>
              )}
              {visibleRows.map((row, i) => (
                <ChatBubble key={i} row={row} />
              ))}
              {finished && (
                <div
                  className="rounded-xl"
                  style={{
                    background: "var(--pulse-tint)",
                    border: "1px solid var(--pulse-soft)",
                    padding: "12px 16px",
                    marginTop: 6,
                  }}
                >
                  <div
                    className="font-bold uppercase mb-1"
                    style={{
                      fontSize: 10.5,
                      letterSpacing: "0.12em",
                      color: "var(--pulse-deep)",
                    }}
                  >
                    What this run tested
                  </div>
                  <p className="text-[12.5px]" style={{ color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {persona.summary}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right rail — critique panel */}
          <div
            style={{
              width: 320,
              borderLeft: "1px solid var(--line)",
              background: "var(--paper-2)",
              overflowY: "auto",
              padding: "12px 14px",
              flexShrink: 0,
            }}
          >
            <SectionEyebrow>Rule annotations</SectionEyebrow>
            <div className="flex flex-col mt-2" style={{ gap: 10 }}>
              {visibleRows.filter((r) => r.critique).length === 0 && (
                <p className="text-[12px]" style={{ color: "var(--ink-4)", marginTop: 8 }}>
                  Annotations appear here as the AI responds. Each card explains which prompt rule
                  fired and why.
                </p>
              )}
              {visibleRows.map((row, i) => {
                if (row.role !== "assistant" || !row.critique) return null;
                return (
                  <CritiqueCard
                    key={i}
                    index={visibleRows.slice(0, i + 1).filter((r) => r.role === "assistant").length}
                    critique={row.critique}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function PersonaCard({ persona, active, onClick }) {
  const scorePillStyle =
    persona.score >= 9
      ? { bg: "var(--pulse-soft)", color: "var(--pulse-deep)" }
      : persona.score >= 7
        ? { bg: "var(--amber-soft)", color: "#8C5E1F" }
        : { bg: "var(--coral-soft)", color: "var(--coral)" };
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition"
      style={{
        background: active ? "white" : "transparent",
        border: `1px solid ${active ? "var(--ink)" : "var(--line)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span
          className="font-semibold text-[13px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          {persona.name}
        </span>
        <span
          className="text-[10.5px] font-bold"
          style={{
            backgroundColor: scorePillStyle.bg,
            color: scorePillStyle.color,
            padding: "2px 7px",
            borderRadius: 999,
          }}
        >
          NPS {persona.score}
        </span>
      </div>
      <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
        {persona.role}
      </div>
      <p className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-3)", lineHeight: 1.4 }}>
        {persona.description}
      </p>
    </button>
  );
}

function ChatBubble({ row }) {
  if (row.role === "user") {
    const flagBadge = (() => {
      if (row.flag === "abstract")
        return { color: "var(--amber)", text: "⚠ Abstract noun detected" };
      if (row.flag === "legal")
        return { color: "var(--coral)", text: "⚠ Legal mention — flag for human review" };
      return null;
    })();
    return (
      <div className="flex justify-end">
        <div style={{ maxWidth: "min(86%, 480px)" }}>
          <div
            className="text-[13.5px] leading-[1.5]"
            style={{
              backgroundColor: "var(--ink)",
              color: "white",
              padding: "10px 14px",
              borderRadius: "14px 14px 4px 14px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {row.text}
          </div>
          {flagBadge && (
            <div
              className="text-[11px] font-semibold mt-1 text-right"
              style={{ color: flagBadge.color }}
            >
              {flagBadge.text}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: 28,
          height: 28,
          background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
          color: "white",
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 11.5,
        }}
        aria-hidden="true"
      >
        RP
      </span>
      <div
        className="text-[13.5px] leading-[1.5]"
        style={{
          maxWidth: "min(86%, 480px)",
          backgroundColor: "white",
          color: "var(--ink)",
          padding: "11px 14px",
          borderRadius: "4px 14px 14px 14px",
          boxShadow: "var(--shadow-sm)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: "1px solid var(--line)",
        }}
      >
        {row.text}
      </div>
    </div>
  );
}

function CritiqueCard({ index, critique }) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: "white",
        borderLeft: "3px solid var(--plum)",
        border: "1px solid var(--line)",
        borderLeftWidth: 3,
        padding: "10px 12px",
      }}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
          AI{index}
        </span>
        <span className="font-semibold text-[12px]" style={{ color: "var(--plum)" }}>
          {critique.rule}
        </span>
      </div>
      <p className="text-[11.5px]" style={{ color: "var(--ink-2)", lineHeight: 1.45 }}>
        {critique.why}
      </p>
    </div>
  );
}

function SectionEyebrow({ children }) {
  return (
    <div
      className="font-bold uppercase"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--ink-4)",
      }}
    >
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const ghostBtnStyle = {
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  background: "white",
  color: "var(--ink-2)",
  border: "1px solid var(--line-2)",
  cursor: "pointer",
};

const primaryBtnStyle = {
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  background: "var(--pulse)",
  color: "white",
  border: "1px solid var(--pulse)",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
};
