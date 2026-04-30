import { useState, useEffect, useRef } from "react";
import { TEST_PERSONAS, TEST_TRANSCRIPTS, TEST_SUMMARIES } from "../data/testPersonas";

/**
 * Test Interview Modal — v0
 *
 * Lets the operator step through scripted persona transcripts that
 * demonstrate what the V2 system prompt SHOULD produce. Each AI message
 * with a `critique` field surfaces in the right-rail "Prompt behavior"
 * panel as it appears, naming which V2 rule fired.
 *
 * Why scripted (not live-model) for v0:
 * - Proves the rule-firing concept and gives the operator something to
 *   show clients/internal team without burning Anthropic tokens.
 * - Lets us iterate on the persona library and critique copy independently
 *   of the prompt itself.
 * - v1 of this same modal will swap in real model calls behind the same
 *   transcript shape — the UI doesn't have to change.
 *
 * Props:
 *   isOpen      — visibility
 *   onClose     — close handler
 *   clientName  — string substituted into [CLIENT_NAME] tokens. Defaults to
 *                 a generic fallback so the modal works without a client
 *                 picked.
 */
export default function TestInterviewModal({
  isOpen,
  onClose,
  clientName = "your management company",
}) {
  const [personaId, setPersonaId] = useState(TEST_PERSONAS[1].id); // start with passive — most interesting demo
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const transcriptRef = useRef(null);

  const persona = TEST_PERSONAS.find((p) => p.id === personaId) || TEST_PERSONAS[0];
  const rawTranscript = TEST_TRANSCRIPTS[personaId] || [];
  const transcript = rawTranscript.map((t) => ({
    ...t,
    text: t.text.replaceAll("[CLIENT_NAME]", clientName),
  }));

  // Reset when persona changes
  useEffect(() => {
    setStep(0);
    setRunning(false);
  }, [personaId]);

  // Drive the playback
  useEffect(() => {
    if (!running) return;
    if (step >= transcript.length) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 200 : 950);
    return () => clearTimeout(t);
  }, [running, step, transcript.length]);

  // Reset everything when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRunning(false);
      setStep(0);
    }
  }, [isOpen]);

  // Auto-scroll transcript to bottom as new messages arrive
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [step]);

  if (!isOpen) return null;

  const visible = transcript.slice(0, step);
  const completed = step >= transcript.length;
  const annotations = visible
    .map((m, i) => (m.critique ? { id: i, text: m.critique } : null))
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl overflow-hidden flex flex-col"
        style={{
          maxWidth: 1100,
          width: "100%",
          height: "92vh",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-interview-title"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <h2
              id="test-interview-title"
              className="text-lg font-semibold"
              style={{ color: "var(--ink)" }}
            >
              Test interview · {clientName.split(",")[0]}
            </h2>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              v3.2 system prompt + active client supplement. No data is saved. Scripted v0.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg border transition"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            Close
          </button>
        </div>

        {/* Three-column body */}
        <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: "260px 1fr 320px" }}>
          {/* Left rail: persona picker */}
          <div className="border-r p-3 overflow-y-auto" style={{ borderColor: "var(--line)" }}>
            <p
              className="text-[11px] font-semibold uppercase tracking-wider px-1 pb-2"
              style={{ color: "var(--ink-4), letterSpacing: 0.12em" }}
            >
              Sample personas
            </p>
            {TEST_PERSONAS.map((p) => {
              const selected = p.id === personaId;
              const scoreColor =
                p.score >= 9
                  ? { bg: "var(--leaf-tint)", fg: "var(--pulse-deep)" }
                  : p.score >= 7
                    ? { bg: "var(--amber-tint)", fg: "#8C5E1F" }
                    : { bg: "var(--coral-tint)", fg: "#B14530" };
              return (
                <button
                  key={p.id}
                  onClick={() => setPersonaId(p.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg mb-1.5 transition border"
                  style={{
                    borderColor: selected ? "var(--ink)" : "var(--line)",
                    backgroundColor: selected ? "var(--paper-2)" : "white",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                      {p.name}
                    </span>
                    <span
                      className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: scoreColor.bg, color: scoreColor.fg }}
                    >
                      {p.score}
                    </span>
                  </div>
                  <p className="text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Center: transcript */}
          <div className="flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: "var(--line)" }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                  {persona.name}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {persona.role}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setStep(0);
                    setRunning(false);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border transition"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
                >
                  Restart
                </button>
                {!running && !completed && (
                  <button
                    onClick={() => setRunning(true)}
                    className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition"
                    style={{ backgroundColor: "var(--pulse)" }}
                  >
                    Run interview
                  </button>
                )}
                {running && (
                  <span
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{
                      backgroundColor: "var(--pulse-tint)",
                      color: "var(--pulse-deep)",
                    }}
                  >
                    Running…
                  </span>
                )}
                {completed && (
                  <span
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{
                      backgroundColor: "var(--pulse-tint)",
                      color: "var(--pulse-deep)",
                    }}
                  >
                    Complete
                  </span>
                )}
              </div>
            </div>

            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
              {visible.length === 0 && (
                <div
                  className="text-sm text-center py-12 px-6 mx-auto max-w-md"
                  style={{ color: "var(--ink-4)" }}
                >
                  Click <strong style={{ color: "var(--ink-2)" }}>Run interview</strong> to play
                  this persona's scripted response. Watch how the AI handles abstraction, depth, and
                  sensitive topics.
                </div>
              )}
              {visible.map((m, i) => (
                <TranscriptBubble key={i} message={m} />
              ))}
            </div>
          </div>

          {/* Right rail: prompt behavior */}
          <div
            className="border-l overflow-y-auto p-4"
            style={{ borderColor: "var(--line)", backgroundColor: "var(--paper-2)" }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--ink-4)" }}
            >
              Prompt behavior
            </p>
            <p className="text-[12px] mb-4" style={{ color: "var(--ink-3)" }}>
              Annotations appear here as the AI's responses fire V2 rules. The score in the left
              rail tells you which rules to expect.
            </p>

            {annotations.length === 0 && !completed && (
              <p className="text-[12px] italic" style={{ color: "var(--ink-4)" }}>
                No rules fired yet.
              </p>
            )}

            <div className="space-y-2">
              {annotations.map((a) => (
                <div
                  key={a.id}
                  className="border-l-4 p-3 rounded-r bg-white"
                  style={{ borderColor: "var(--plum)" }}
                >
                  <p
                    className="text-[10.5px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--plum)", letterSpacing: "0.1em" }}
                  >
                    Rule fired
                  </p>
                  <p className="text-[12.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    {a.text}
                  </p>
                </div>
              ))}
            </div>

            {completed && TEST_SUMMARIES[personaId] && (
              <div className="mt-5 p-3 rounded-lg" style={{ backgroundColor: "var(--leaf-tint)" }}>
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--pulse-deep)" }}
                >
                  Interview accomplished
                </p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {TEST_SUMMARIES[personaId]}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptBubble({ message }) {
  const isAi = message.who === "ai";

  if (isAi) {
    return (
      <div className="flex gap-2.5">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: "var(--ink)" }}
          title="AI"
        >
          RP
        </div>
        <div
          className="rounded-lg px-3 py-2 max-w-[80%]"
          style={{
            backgroundColor: "white",
            border: "1px solid var(--line)",
            color: "var(--ink-2)",
          }}
        >
          <p className="text-[13.5px] leading-relaxed">{message.text}</p>
        </div>
      </div>
    );
  }

  // Resident bubble
  const flagStyle =
    message.flag === "legal"
      ? {
          bg: "var(--coral-tint)",
          border: "var(--coral-soft)",
          footer: "⚠ Legal mention — flag for human review",
        }
      : message.flag === "abstract"
        ? {
            bg: "var(--amber-tint)",
            border: "var(--amber-soft)",
            footer: "⚠ Abstract noun detected",
          }
        : { bg: "var(--paper-2)", border: "var(--line-2)", footer: null };

  return (
    <div className="flex gap-2.5 justify-end">
      <div
        className="rounded-lg px-3 py-2 max-w-[80%]"
        style={{
          backgroundColor: flagStyle.bg,
          border: `1px solid ${flagStyle.border}`,
          color: "var(--ink-2)",
        }}
      >
        <p className="text-[13.5px] leading-relaxed">{message.text}</p>
        {flagStyle.footer && (
          <p
            className="text-[10.5px] mt-1.5 font-semibold"
            style={{ color: message.flag === "legal" ? "#B14530" : "#8C5E1F" }}
          >
            {flagStyle.footer}
          </p>
        )}
      </div>
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
        style={{
          background: "linear-gradient(135deg, var(--plum), var(--plum-soft))",
          color: "var(--ink)",
        }}
        title="Board member"
      >
        BM
      </div>
    </div>
  );
}
