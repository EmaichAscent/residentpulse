import { useState } from "react";

/**
 * NPS scale — Polished variant rebuild (Phase 3).
 *
 * Differences from the original:
 *   - 11 outlined circles 0-10 — no red/amber/green color-coding
 *     (avoids biasing the resident toward any direction).
 *   - Auto-advance on tap. No "Submit Score" button. Confirms instantly
 *     so the next AI message arrives without a second click.
 *   - "Tap a number — it'll auto-advance" hint replaces the "How likely"
 *     prompt (the AI message above this scale already asks the question).
 *   - Subtle "Not at all" / "Extremely likely" anchors at the ends.
 *
 * Auto-advance is debounced briefly so the user sees their selection
 * highlight before the chat moves forward.
 */
export default function NpsScale({ onSelect }) {
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleSelect = (n) => {
    if (confirmed) return;
    setSelected(n);
    setConfirmed(true);
    // Brief delay so the user sees their selection register, then advance.
    setTimeout(() => onSelect(n), 220);
  };

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--line)", backgroundColor: "white" }}
      data-testid="nps-scale"
    >
      <div className="flex justify-between text-[11px] mb-2 px-1" style={{ color: "var(--ink-4)" }}>
        <span>Not at all</span>
        <span>Extremely likely</span>
      </div>
      {/* CSS grid with 11 equal columns — buttons scale to fit any
          container width without overflowing. The previous flex
          layout had min-w-[34px] on each button which forced a
          ≥498px total width and clipped buttons 9 and 10 inside the
          420–480px card. */}
      <div className="grid grid-cols-11 gap-1 mb-3">
        {Array.from({ length: 11 }, (_, i) => {
          const isSelected = selected === i;
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={confirmed && !isSelected}
              className="aspect-square rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
              style={{
                border: `1.5px solid ${isSelected ? "var(--ink)" : "var(--line-2)"}`,
                backgroundColor: isSelected ? "var(--ink)" : "white",
                color: isSelected ? "white" : "var(--ink-2)",
              }}
              aria-label={`NPS score ${i}`}
              aria-pressed={isSelected}
            >
              {i}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-center" style={{ color: "var(--ink-4)" }}>
        {confirmed ? "Got it." : "Tap a number — it'll auto-advance."}
      </p>
    </div>
  );
}
