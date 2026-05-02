import { useState, useEffect, useRef } from "react";

/**
 * InfoTip — small "?" badge that opens a plain-English explainer
 * tooltip on hover (desktop) or click (touch). Used next to chart and
 * card headings on Trends + Round Dashboard so admins can learn how
 * to read every visualization without leaving the page.
 *
 * Behavior:
 *   - Hover opens / leave closes (mouse).
 *   - Click toggles (touch + keyboard).
 *   - Click outside closes (dismisses sticky-on-tap state).
 *   - Escape closes.
 *   - Aligned by `align` prop ("left" | "right") so the popup doesn't
 *     overflow the card edge — pass "right" when the tip sits at the
 *     right side of its parent.
 *
 * Accessibility:
 *   - Trigger is a real <button> with aria-label and aria-expanded.
 *   - Popup has role="tooltip" and is associated via aria-describedby
 *     when open (browser AT picks up the relationship).
 */
let nextTipId = 0;

export default function InfoTip({ children, align = "left", label = "What is this?" }) {
  const [open, setOpen] = useState(false);
  const [tipId] = useState(() => `infotip-${++nextTipId}`);
  const wrapRef = useRef(null);

  // Close on click-outside (so a tap-to-open tooltip can be dismissed
  // without tapping the trigger again) and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const popupStyle = {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    [align === "right" ? "right" : "left"]: 0,
    width: 280,
    backgroundColor: "var(--ink)",
    color: "white",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1.5,
    fontWeight: 400,
    boxShadow: "var(--shadow-md)",
    zIndex: 50,
    pointerEvents: "auto",
    whiteSpace: "normal",
    letterSpacing: 0,
  };

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center"
      style={{ verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="rounded-full inline-flex items-center justify-center transition"
        style={{
          width: 16,
          height: 16,
          backgroundColor: open ? "var(--ink)" : "transparent",
          color: open ? "white" : "var(--ink-4)",
          border: `1px solid ${open ? "var(--ink)" : "var(--line-2)"}`,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "var(--font-sans)",
          lineHeight: 1,
          cursor: "help",
          padding: 0,
          marginLeft: 6,
        }}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
      >
        ?
      </button>
      {open && (
        <span id={tipId} role="tooltip" style={popupStyle}>
          {children}
        </span>
      )}
    </span>
  );
}
