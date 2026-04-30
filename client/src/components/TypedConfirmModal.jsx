import { useEffect, useRef, useState } from "react";

/**
 * High-friction confirmation modal for destructive actions.
 *
 * Requires the user to type a specific phrase verbatim before the confirm
 * button enables. Use this for Reset / Delete / Deactivate / Hard-delete —
 * anything where a stray click is expensive to undo.
 *
 * Use the lower-friction `ConfirmModal` for non-destructive yes/no prompts.
 *
 * Props:
 *   isOpen          — boolean, controls visibility
 *   onClose         — called on Cancel / Esc / scrim click
 *   onConfirm       — called when the user clicks the enabled confirm button
 *   title           — modal heading (e.g. "Reset Southern States")
 *   message         — body content (string or JSX). Describes what's destroyed.
 *   confirmPhrase   — the exact text the user must type (e.g. company name).
 *                     Comparison is case-sensitive and trimmed.
 *   confirmLabel    — confirm button text. Defaults to "Confirm".
 *   loading         — disables both buttons while an async action runs.
 */
export default function TypedConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmPhrase,
  confirmLabel = "Confirm",
  loading = false,
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);

  // Reset typed value whenever the modal opens, and focus the field.
  useEffect(() => {
    if (isOpen) {
      setTyped("");
      // Defer focus until the field is actually mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const matches = typed.trim() === confirmPhrase.trim();

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl border-2 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #FFFCFB, var(--coral-tint))",
          borderColor: "var(--coral-soft)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="typed-confirm-title"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--coral-soft)" }}
            >
              <svg
                className="w-5 h-5"
                style={{ color: "var(--coral)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"
                />
              </svg>
            </div>
            <h2
              id="typed-confirm-title"
              className="text-lg font-semibold pt-1"
              style={{ color: "var(--ink)" }}
            >
              {title}
            </h2>
          </div>

          <div className="text-sm whitespace-pre-line mb-4" style={{ color: "var(--ink-2)" }}>
            {message}
          </div>

          <label className="block">
            <span className="text-xs font-medium block mb-1.5" style={{ color: "var(--ink-3)" }}>
              Type{" "}
              <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>
                {confirmPhrase}
              </span>{" "}
              to confirm
            </span>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              autoComplete="off"
              spellCheck="false"
              className="w-full px-3 py-2 text-sm font-mono bg-white rounded-md border outline-none transition disabled:opacity-50"
              style={{
                borderColor: matches ? "var(--pulse)" : "var(--line-2)",
                color: "var(--ink)",
              }}
              placeholder=""
            />
          </label>
        </div>

        <div
          className="flex gap-3 justify-end px-6 py-4 border-t"
          style={{ borderColor: "var(--coral-soft)", backgroundColor: "rgba(255,255,255,0.6)" }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50"
            style={{
              color: "var(--ink-2)",
              backgroundColor: "white",
              border: "1px solid var(--line-2)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || loading}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--coral)" }}
          >
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
