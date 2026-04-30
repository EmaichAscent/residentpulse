import { useState, useEffect, useRef } from "react";

/**
 * ActionDrawer — slide-in form for logging an action against a brief pick
 * (or, in a future PR, against any theme on the All Themes table).
 *
 * Closed-loop intent: minimal surface. {what, optional details, owner}.
 * No SLAs, no due dates. The next round's chat will pick this up later.
 *
 * Props
 *   isOpen         — visibility
 *   onClose        — close handler
 *   onSaved        — fired after successful POST; parent refetches
 *   seed           — { theme, title?, details? } prefilled when drawer opens
 *   ownerDefault   — string defaulted into the owner field (current user email)
 */
export default function ActionDrawer({ isOpen, onClose, onSaved, seed, ownerDefault }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const titleRef = useRef(null);

  // When drawer opens, hydrate from seed.
  useEffect(() => {
    if (isOpen && seed) {
      setTitle(seed.title || "");
      setDetails(seed.details || "");
      setOwner(ownerDefault || "");
      setError(null);
      const t = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    if (!isOpen) {
      setTitle("");
      setDetails("");
      setOwner("");
      setError(null);
    }
  }, [isOpen, seed, ownerDefault]);

  // Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, saving, onClose]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: seed?.theme || "Untagged",
          title: title.trim(),
          details: details.trim() || undefined,
          owner_email: owner.trim() || undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-drawer-title"
    >
      <div
        className="bg-white h-full flex flex-col"
        style={{ width: 480, boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
          >
            Log an action {seed?.theme && `· ${seed.theme}`}
          </p>
          <h2
            id="action-drawer-title"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            What are you doing about it?
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <Field
            label="Action"
            hint="Short imperative phrase. e.g. 'Roll out 48-hour SLA dashboard for regional managers'"
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition disabled:opacity-50"
              style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
              placeholder="What are you doing?"
              maxLength={200}
            />
          </Field>

          <Field label="A few details (optional)">
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={saving}
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition disabled:opacity-50 resize-none"
              style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
              placeholder="Notes, context, anything you'd want to remember next quarter."
              maxLength={2000}
            />
          </Field>

          <Field label="Owner" hint="Who's accountable for this action?">
            <input
              type="email"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition disabled:opacity-50"
              style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
              placeholder="email@example.com"
            />
          </Field>

          <div
            className="text-xs p-3 rounded-md"
            style={{ backgroundColor: "var(--plum-tint)", color: "var(--ink-2)" }}
          >
            <strong>How this gets used:</strong> next round, board members at affected communities
            will be told: "your management company has been working on <em>{title || "this"}</em> —
            has that shown up at your community yet?"
          </div>

          {error && (
            <div className="text-xs p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>

        <div
          className="flex justify-end gap-2 px-6 py-4 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg border transition disabled:opacity-50"
            style={{ borderColor: "var(--line-2)", color: "var(--ink-2)" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="text-sm px-4 py-2 rounded-lg text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--pulse)" }}
          >
            {saving ? "Saving…" : "Log action"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span
        className="text-[11px] font-semibold uppercase block mb-1"
        style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px] mt-1 block" style={{ color: "var(--ink-4)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
