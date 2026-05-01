import { useState, useEffect, useCallback } from "react";

/**
 * Board Members — full rebuild matching DESIGN/design_handoff_clientapp/
 * src/screens/Members.jsx.
 *
 * Sections:
 *   1. Page header: title + count + Export CSV / Import / Add member
 *   2. Stat strip (4 cards): Responded / Flagged (NPS ≤ 6) / Pending / Unsubscribed
 *   3. Search + filters (Status / Community)
 *   4. Members table — avatar (sentiment-tinted) + name/email | community
 *      | status pill | last activity | Edit (inline) + Archive
 *
 * Inline edit: clicking Edit expands the row in place with form fields
 * (first/last name, email, community). Save PATCHes via PUT
 * /api/admin/board-members/:id.
 *
 * Archive: trash icon → confirm modal → DELETE /api/admin/board-members/:id
 * which is a SOFT DELETE (sets active=FALSE so historical session data
 * remains tied to the member). The deactivated members are reachable via
 * a separate endpoint (kept out of this view to match the spec).
 */
export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [communityFilter, setCommunityFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  // 'active' shows the working roster; 'archived' shows soft-deleted
  // members from /board-members/inactive with a Reactivate action in
  // place of Archive.
  const [view, setView] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        view === "archived" ? "/api/admin/board-members/inactive" : "/api/admin/board-members";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load members");
      setMembers(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      const res = await fetch(`/api/admin/board-members/${archiveTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to archive");
      setArchiveTarget(null);
      await load();
    } catch (err) {
      alert(err.message);
      setArchiveTarget(null);
    }
  };

  const handleSaveEdit = async (id, patch) => {
    try {
      const res = await fetch(`/api/admin/board-members/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReactivate = async (id) => {
    try {
      const res = await fetch(`/api/admin/board-members/${id}/reactivate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reactivate");
      }
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async (patch) => {
    try {
      const res = await fetch("/api/admin/board-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add");
      }
      setAddOpen(false);
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <p
        className="text-center py-10"
        style={{ color: "var(--ink-4)" }}
        data-testid="members-loading"
      >
        Loading…
      </p>
    );
  }
  if (error) {
    return <p className="text-center py-10 text-red-500">{error}</p>;
  }

  // Status derivation per row. The board-members endpoint returns
  // latest_nps + invite_status; we compute the spec's pill categories
  // client-side from those. Unsubscribed isn't a real flag yet — we
  // proxy via invite_status === 'complained' or 'bounced'.
  const enriched = members.map((m) => ({
    ...m,
    status: deriveStatus(m),
  }));

  const stats = {
    responded: enriched.filter((m) => m.status === "responded").length,
    flagged: enriched.filter((m) => m.status === "flagged").length,
    pending: enriched.filter((m) => m.status === "pending").length,
    unsubscribed: enriched.filter((m) => m.status === "unsubscribed").length,
  };

  const communities = Array.from(new Set(enriched.map((m) => m.community_name).filter(Boolean)));

  const filtered = enriched.filter((m) => {
    if (statusFilter && m.status !== statusFilter) return false;
    if (communityFilter && m.community_name !== communityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack =
        `${m.first_name || ""} ${m.last_name || ""} ${m.email || ""} ${m.community_name || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3.5" data-testid="members">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Board members
          </h1>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            {view === "archived"
              ? `${members.length} archived. Reactivate to bring back into the active roster.`
              : `${members.length} members across the portfolio. Quick visual of who's responded — details and data hygiene live here.`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <a
            href="/api/admin/board-members/export"
            className="btn-ghost"
            style={{ textDecoration: "none" }}
          >
            Export CSV
          </a>
          <button
            onClick={() =>
              alert(
                "Import flow coming soon — drop a CSV with email, first_name, last_name, community_name columns."
              )
            }
            className="btn-ghost"
            type="button"
          >
            Import
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-pulse" type="button">
            + Add member
          </button>
        </div>
      </div>

      {/* Stat strip — only relevant on the Active view (archived
            members don't carry latest_nps / delivery_status). */}
      {view === "active" && (
        <div className="grid gap-3 mb-3.5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <StatCard label="Responded" n={stats.responded} color="var(--pulse)" />
          <StatCard label="Flagged (NPS ≤ 6)" n={stats.flagged} color="var(--coral)" />
          <StatCard label="Pending" n={stats.pending} color="var(--amber)" />
          <StatCard label="Unsubscribed" n={stats.unsubscribed} color="var(--ink-3)" />
        </div>
      )}

      {/* Filters + table */}
      <div
        className="rounded-2xl bg-white overflow-hidden"
        style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
      >
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search members…" />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "responded", label: "Responded" },
              { value: "flagged", label: "Flagged (NPS ≤ 6)" },
              { value: "pending", label: "Pending" },
              { value: "unsubscribed", label: "Unsubscribed" },
            ]}
          />
          <FilterSelect
            label="Community"
            value={communityFilter}
            onChange={setCommunityFilter}
            options={communities.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <TableHeader />
        <div>
          {filtered.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-center" style={{ color: "var(--ink-4)" }}>
              No members match these filters.
            </p>
          ) : (
            filtered.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                view={view}
                isLast={i === filtered.length - 1}
                isEditing={editingId === m.id}
                onStartEdit={() => setEditingId(m.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(patch) => handleSaveEdit(m.id, patch)}
                onArchive={() => setArchiveTarget(m)}
                onReactivate={() => handleReactivate(m.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Add member modal */}
      {addOpen && (
        <MemberModal
          mode="create"
          initial={{}}
          onCancel={() => setAddOpen(false)}
          onSave={handleCreate}
        />
      )}

      {/* Archive confirm */}
      {archiveTarget && (
        <ArchiveModal
          name={fullName(archiveTarget)}
          subjectKind="board member"
          onCancel={() => setArchiveTarget(null)}
          onConfirm={handleArchive}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div
      className="grid items-center gap-3 px-5 py-3 text-[10.5px] font-bold uppercase"
      style={{
        gridTemplateColumns: "2fr 1.6fr 1.2fr 1fr auto",
        letterSpacing: "0.06em",
        color: "var(--ink-4)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span>Member</span>
      <span>Community</span>
      <span>Status</span>
      <span>Last activity</span>
      <span style={{ width: 110, textAlign: "right" }} />
    </div>
  );
}

function MemberRow({
  member,
  view,
  isLast,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onArchive,
  onReactivate,
}) {
  if (isEditing) {
    return (
      <MemberEditRow member={member} isLast={isLast} onCancel={onCancelEdit} onSave={onSave} />
    );
  }

  const status = member.status;
  const tone =
    status === "responded"
      ? "var(--pulse)"
      : status === "flagged"
        ? "var(--coral)"
        : status === "pending"
          ? "var(--amber)"
          : "var(--ink-4)";
  const initials =
    `${(member.first_name || "").charAt(0)}${(member.last_name || "").charAt(0)}`.toUpperCase() ||
    "?";

  return (
    <div
      className="grid items-center gap-3 px-5 py-3 transition hover:bg-[var(--paper-2)]"
      style={{
        gridTemplateColumns: "2fr 1.6fr 1.2fr 1fr auto",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
          style={{ width: 28, height: 28, fontSize: 11, backgroundColor: tone }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[13.5px] truncate" style={{ color: "var(--ink)" }}>
            {fullName(member)}
          </div>
          <div className="text-[11.5px] truncate" style={{ color: "var(--ink-3)" }}>
            {member.email}
          </div>
        </div>
      </div>
      <span className="text-[13px] truncate" style={{ color: "var(--ink-2)" }}>
        {member.community_name || "—"}
      </span>
      <StatusPill status={status} score={member.latest_nps} />
      <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        {member.updated_at ? formatRelative(member.updated_at) : "—"}
      </span>
      <div className="flex items-center gap-1.5" style={{ width: 110, justifyContent: "flex-end" }}>
        {view === "archived" ? (
          <button onClick={onReactivate} className="btn-pulse-sm" type="button">
            Reactivate
          </button>
        ) : (
          <>
            <button onClick={onStartEdit} className="btn-ghost-sm" type="button">
              Edit
            </button>
            <ArchiveIconButton onClick={onArchive} title="Archive member" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Active / Archived view switcher. Used on both Members and
 * Communities for consistency. Same visual as the cadence toggle on
 * the Rounds page.
 */
export function ViewToggle({ value, onChange }) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ backgroundColor: "var(--paper-2)", border: "1px solid var(--line)" }}
    >
      {[
        { v: "active", label: "Active" },
        { v: "archived", label: "Archived" },
      ].map((o) => {
        const isActive = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => !isActive && onChange(o.v)}
            type="button"
            className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition"
            style={{
              backgroundColor: isActive ? "white" : "transparent",
              color: isActive ? "var(--ink)" : "var(--ink-3)",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MemberEditRow({ member, isLast, onCancel, onSave }) {
  const [firstName, setFirstName] = useState(member.first_name || "");
  const [lastName, setLastName] = useState(member.last_name || "");
  const [email, setEmail] = useState(member.email || "");
  const [community, setCommunity] = useState(member.community_name || "");
  // The user-level "office" is stored as `management_company` on the
  // users table — a legacy text field that gets canonicalized into
  // the locations table on save via autoCreateLocationIfNeeded. Most
  // members inherit their office through their community's location
  // (preferred), but this field lets data-hygiene fix mis-attributed
  // rows directly.
  const [office, setOffice] = useState(member.management_company || "");

  return (
    <div
      className="px-5 py-4"
      style={{
        backgroundColor: "var(--paper-2)",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <div
        className="grid gap-3 items-end"
        style={{ gridTemplateColumns: "1fr 1fr 1.6fr 1.4fr 1.2fr auto" }}
      >
        <FieldInput label="First name" value={firstName} onChange={setFirstName} />
        <FieldInput label="Last name" value={lastName} onChange={setLastName} />
        <FieldInput label="Email" value={email} onChange={setEmail} />
        <FieldInput label="Community" value={community} onChange={setCommunity} />
        <FieldInput label="Office" value={office} onChange={setOffice} />
        <div className="flex gap-1.5">
          <button
            onClick={() =>
              onSave({
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                email: email.trim(),
                community_name: community.trim() || null,
                management_company: office.trim() || null,
              })
            }
            className="btn-pulse-sm"
            type="button"
          >
            Save
          </button>
          <button onClick={onCancel} className="btn-ghost-sm" type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberModal({ initial, onCancel, onSave }) {
  const [firstName, setFirstName] = useState(initial?.first_name || "");
  const [lastName, setLastName] = useState(initial?.last_name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [community, setCommunity] = useState(initial?.community_name || "");
  const [office, setOffice] = useState(initial?.management_company || "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3
          className="font-semibold mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}
        >
          Add board member
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="First name" value={firstName} onChange={setFirstName} />
          <FieldInput label="Last name" value={lastName} onChange={setLastName} />
        </div>
        <FieldInput label="Email" value={email} onChange={setEmail} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Community" value={community} onChange={setCommunity} />
          <FieldInput label="Office" value={office} onChange={setOffice} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="btn-ghost" type="button">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!email.trim()) {
                alert("Email is required.");
                return;
              }
              onSave({
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                email: email.trim(),
                community_name: community.trim() || null,
                management_company: office.trim() || null,
              });
            }}
            className="btn-pulse"
            type="button"
          >
            Add member
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, n, color }) {
  return (
    <div
      className="rounded-2xl bg-white px-5 py-4"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      <div
        className="text-[11px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.1em", color: "var(--ink-4)" }}
      >
        {label}
      </div>
      <div
        className="font-medium"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 30,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        {n}
      </div>
    </div>
  );
}

function StatusPill({ status, score }) {
  const variants = {
    responded: {
      bg: "var(--pulse-tint)",
      color: "var(--pulse-deep)",
      label: `Responded · ${score ?? "?"}`,
    },
    flagged: { bg: "var(--coral-tint)", color: "var(--coral)", label: `Flagged · ${score ?? "?"}` },
    pending: { bg: "var(--amber-tint)", color: "var(--amber)", label: "Pending" },
    unsubscribed: { bg: "var(--paper-3)", color: "var(--ink-3)", label: "Unsubscribed" },
  }[status] || { bg: "var(--paper-3)", color: "var(--ink-3)", label: status };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
      style={{ backgroundColor: variants.bg, color: variants.color }}
    >
      {variants.label}
    </span>
  );
}

export function ArchiveIconButton({ onClick, title }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="rounded-md p-1.5 hover:bg-[var(--coral-tint)] transition"
      style={{ color: "var(--ink-4)" }}
      title={title || "Archive"}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
      </svg>
    </button>
  );
}

export function ArchiveModal({ name, subjectKind, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h3 className="font-semibold text-[16px] mb-2" style={{ color: "var(--ink)" }}>
          Archive {subjectKind} {name && <>“{name}”</>}?
        </h3>
        <p className="text-[13.5px] mb-4" style={{ color: "var(--ink-3)" }}>
          The {subjectKind} is removed from the active roster. Historical survey responses,
          summaries, and reporting are preserved — this is a soft archive, not a delete.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost" type="button">
            Cancel
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
            disabled={busy}
            className="btn-pulse"
            type="button"
          >
            {busy ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
      <span
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--ink-4)",
        }}
      >
        🔍
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-[13px] outline-none"
        style={{
          width: "100%",
          height: 34,
          padding: "0 12px 0 32px",
          border: "1px solid var(--line-2)",
          borderRadius: 8,
          backgroundColor: "var(--paper)",
          color: "var(--ink)",
        }}
      />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12px] px-2.5 py-1.5 rounded-md outline-none cursor-pointer"
      style={{
        border: "1px solid var(--line-2)",
        backgroundColor: "white",
        color: value ? "var(--ink)" : "var(--ink-3)",
      }}
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FieldInput({ label, value, onChange, type = "text" }) {
  return (
    <div className="mb-3">
      <label
        className="block text-[10.5px] font-semibold uppercase mb-1"
        style={{ letterSpacing: "0.08em", color: "var(--ink-4)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-lg outline-none"
        style={{ border: "1px solid var(--line-2)", color: "var(--ink)" }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function deriveStatus(m) {
  if (m.invite_status === "complained") return "unsubscribed";
  if (m.delivery_status === "bounced" || m.delivery_status === "complained") return "unsubscribed";
  if (m.latest_nps != null) {
    return m.latest_nps <= 6 ? "flagged" : "responded";
  }
  return "pending";
}

function fullName(m) {
  return [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—";
}

function formatRelative(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
