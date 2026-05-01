import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/**
 * OwnerPicker — searchable popover that lists admin users from
 * /api/admin/users so an action can be assigned (or reassigned) to
 * someone on the team. Source-of-truth is the same list shown on
 * Account → Admin users; users can't be created from here, only
 * picked. The popover footer routes to the Account page when the
 * person you're looking for isn't on the list yet.
 *
 * Two render modes:
 *   trigger="chip"  — pill-style trigger that shows the current owner
 *                     (avatar + name + caret) or "Assign owner ▾"
 *   trigger="text"  — bare text link, used inside CTA rows
 *
 * Props
 *   value           — current owner_email
 *   onChange(email) — called when a user is picked or "clear" tapped
 *   onClose         — optional handler fired after picker closes
 *   trigger         — "chip" | "text"
 *   triggerLabel    — override the chip label (defaults to "Assign owner")
 *   compact         — render the chip smaller (used inside row layouts)
 */
export default function OwnerPicker({
  value,
  onChange,
  onClose,
  trigger = "chip",
  triggerLabel = "Assign owner",
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        onClose?.();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        onClose?.();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Fetch admin users on first open. Cached client-side for the
  // session — they don't change often and refetching every open is
  // wasted work.
  useEffect(() => {
    if (!open || users.length > 0 || loading) return;
    setLoading(true);
    fetch("/api/admin/users", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [open, users.length, loading]);

  // Auto-focus search on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (u.email || "").toLowerCase().includes(q) ||
      (u.first_name || "").toLowerCase().includes(q) ||
      (u.last_name || "").toLowerCase().includes(q)
    );
  });

  const currentUser = users.find((u) => u.email === value);
  const ownerLabel = currentUser
    ? fullName(currentUser) || currentUser.email
    : value || triggerLabel;
  const ownerInitials = currentUser
    ? initialsFor(currentUser)
    : value
      ? value[0].toUpperCase()
      : "+";
  const ownerAvaTone = currentUser ? avaTone(currentUser.email || "") : "empty";

  const pick = (email) => {
    onChange(email);
    setOpen(false);
    onClose?.();
  };

  return (
    <span ref={wrapperRef} style={{ position: "relative", display: "inline-block" }}>
      {trigger === "chip" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full transition"
          style={{
            padding: compact ? "3px 10px 3px 3px" : "5px 12px 5px 5px",
            backgroundColor: "white",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
        >
          <Avatar tone={ownerAvaTone} initials={ownerInitials} size={compact ? 18 : 22} />
          <span
            className="font-semibold"
            style={{
              fontSize: 12.5,
              color: value ? "var(--ink)" : "var(--ink-4)",
              fontStyle: value ? "normal" : "italic",
            }}
          >
            {ownerLabel}
          </span>
          <Caret />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-semibold"
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            color: "var(--pulse-deep)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {triggerLabel}
        </button>
      )}

      {open && (
        <div
          className="rounded-2xl"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            backgroundColor: "white",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg)",
            padding: 8,
            minWidth: 280,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search admins…"
            className="w-full"
            style={{
              padding: "8px 12px",
              border: "1px solid var(--line-2)",
              borderRadius: 8,
              fontSize: 13,
              outline: "none",
              marginBottom: 6,
            }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {loading && (
              <p className="text-center py-3 text-[12px]" style={{ color: "var(--ink-4)" }}>
                Loading…
              </p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-center py-3 text-[12px]" style={{ color: "var(--ink-4)" }}>
                No admins match "{query}".
              </p>
            )}
            {!loading &&
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(u.email)}
                  className="w-full flex items-center gap-2.5"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: u.email === value ? "var(--paper-2)" : "transparent",
                    cursor: "pointer",
                    border: 0,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (u.email !== value) e.currentTarget.style.backgroundColor = "var(--paper-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (u.email !== value) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Avatar tone={avaTone(u.email || "")} initials={initialsFor(u)} size={24} />
                  <span className="flex-1 min-w-0">
                    <div
                      className="font-semibold truncate"
                      style={{ fontSize: 13, color: "var(--ink)" }}
                    >
                      {fullName(u) || u.email}
                    </div>
                    {fullName(u) && (
                      <div className="text-[11px] truncate" style={{ color: "var(--ink-4)" }}>
                        {u.email}
                      </div>
                    )}
                  </span>
                  {u.email === value && (
                    <span
                      className="text-[10.5px] font-bold rounded-full"
                      style={{
                        color: "var(--pulse-deep)",
                        backgroundColor: "var(--pulse-tint)",
                        padding: "2px 7px",
                        letterSpacing: "0.04em",
                      }}
                    >
                      OWNER
                    </span>
                  )}
                </button>
              ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => pick("")}
              className="w-full text-left"
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 6,
                background: "transparent",
                border: 0,
                fontSize: 12,
                color: "var(--ink-3)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--paper-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              ✕ Unassign
            </button>
          )}
          <Link
            to="/admin/account"
            onClick={() => setOpen(false)}
            className="block"
            style={{
              marginTop: 4,
              padding: "8px 10px",
              borderTop: "1px solid var(--line)",
              fontSize: 12,
              color: "var(--pulse-deep)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Add admin in Account →
          </Link>
        </div>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────────────

function fullName(u) {
  if (!u) return "";
  return [u.first_name, u.last_name].filter(Boolean).join(" ");
}

function initialsFor(u) {
  if (!u) return "?";
  const first = (u.first_name || u.email || "?")[0];
  const last = (u.last_name || "")[0] || "";
  return (first + last).toUpperCase();
}

// Stable hash → one of 4 avatar gradients. Same email → same color.
function avaTone(seed) {
  if (!seed) return "blue";
  const tones = ["coral", "amber", "blue", "purple"];
  const sum = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return tones[Math.abs(sum) % tones.length];
}

const TONE_GRADIENTS = {
  coral: "linear-gradient(135deg, #F08672, #F2C28A)",
  amber: "linear-gradient(135deg, #F2C28A, #E89E5A)",
  blue: "linear-gradient(135deg, #6FA8E3, #4F7DBE)",
  purple: "linear-gradient(135deg, #B79FE3, #856ECC)",
  empty: "var(--paper-3)",
};

function Avatar({ tone = "blue", initials = "?", size = 22 }) {
  return (
    <span
      className="rounded-full inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: TONE_GRADIENTS[tone] || TONE_GRADIENTS.blue,
        color: tone === "empty" ? "var(--ink-4)" : "white",
        fontSize: size <= 20 ? 9.5 : 10.5,
        fontWeight: 600,
      }}
    >
      {initials}
    </span>
  );
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 4 L5 7 L8 4"
        stroke="var(--ink-4)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
