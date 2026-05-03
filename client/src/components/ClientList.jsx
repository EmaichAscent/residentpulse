import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { computeHealth, HEALTH_ORDER } from "../utils/clientHealth";

/**
 * SuperAdmin Clients list — PR 8 of the SuperAdmin overhaul, per
 * design handoff §2.
 *
 * The previous version was a 4-column read-only table. With ~13
 * tenants today this works; at 80+ it becomes a navigation problem.
 * The handoff calls for:
 *   • Health column (dot + label, default sort = risk-first)
 *   • Plan filter chips (All / Free / Starter / Growth / Pro / Enterprise)
 *   • Status filter chips (All / Active rounds / No round / Dormant /
 *     Onboarding incomplete)
 *   • Row click → client detail
 *
 * Health is derived client-side from the enriched /clients payload
 * (active_round_count, onboarding_complete, last_activity,
 * last_round_launched_at). Rules:
 *
 *   • risk      — inactive status OR no admin login >30d OR active
 *                 round + no activity in last 14 days
 *   • attention — onboarding incomplete OR no admin login 14–30d OR
 *                 active round + no activity in last 7 days OR no
 *                 round ever launched on an active tenant
 *   • good      — active + recent login + healthy round/no-round state
 */

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "active_round", label: "Active rounds" },
  { key: "no_round", label: "No round" },
  { key: "dormant", label: "Dormant" },
  { key: "onboarding", label: "Onboarding incomplete" },
];

export default function ClientList({ clients }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("health");
  const [sortDir, setSortDir] = useState("asc"); // asc = risk-first
  const navigate = useNavigate();

  // Build the plan-chip list dynamically from what the tenants actually use.
  const planKeys = useMemo(() => {
    const keys = new Set();
    clients.forEach((c) => c.plan_key && keys.add(c.plan_key));
    return ["all", ...Array.from(keys).sort()];
  }, [clients]);

  const enriched = useMemo(
    () => clients.map((c) => ({ ...c, health: computeHealth(c) })),
    [clients]
  );

  const visible = useMemo(() => {
    let rows = enriched.filter((c) => {
      // search
      const q = search.toLowerCase();
      if (q) {
        const hay = `${c.company_name || ""} ${c.client_code || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // plan
      if (planFilter !== "all" && c.plan_key !== planFilter) return false;
      // status
      switch (statusFilter) {
        case "all":
          break;
        case "active_round":
          if (!c.active_round_count) return false;
          break;
        case "no_round":
          if (c.active_round_count) return false;
          break;
        case "dormant":
          if (c.health.kind !== "risk" && c.health.kind !== "attention") return false;
          break;
        case "onboarding":
          if (c.onboarding_complete) return false;
          break;
        default:
          break;
      }
      return true;
    });

    // Sort
    rows = rows.slice().sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case "health":
          av = HEALTH_ORDER[a.health.kind];
          bv = HEALTH_ORDER[b.health.kind];
          break;
        case "company":
          av = (a.company_name || "").toLowerCase();
          bv = (b.company_name || "").toLowerCase();
          break;
        case "plan":
          av = (a.plan_name || "").toLowerCase();
          bv = (b.plan_name || "").toLowerCase();
          break;
        case "last_activity":
          av = a.last_activity ? new Date(a.last_activity).getTime() : 0;
          bv = b.last_activity ? new Date(b.last_activity).getTime() : 0;
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [enriched, search, planFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Health and last_activity default to "most-urgent first"; others ascending.
      setSortDir(key === "last_activity" ? "desc" : "asc");
    }
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      {/* Search + filters */}
      <div className="flex flex-col gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or client code…"
          className="rounded-lg"
          style={{
            padding: "8px 12px",
            fontSize: 13,
            border: "1px solid var(--line-2)",
            background: "white",
            color: "var(--ink)",
            outline: "none",
            maxWidth: 360,
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-bold uppercase text-[10.5px]"
            style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
          >
            Plan:
          </span>
          {planKeys.map((k) => (
            <Chip key={k} active={planFilter === k} onClick={() => setPlanFilter(k)}>
              {k === "all" ? "All" : k}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-bold uppercase text-[10.5px]"
            style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
          >
            Status:
          </span>
          {STATUS_CHIPS.map((c) => (
            <Chip
              key={c.key}
              active={statusFilter === c.key}
              onClick={() => setStatusFilter(c.key)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Counts row */}
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[12px]" style={{ color: "var(--ink-4)" }}>
          {visible.length} {visible.length === 1 ? "client" : "clients"}
          {visible.length !== clients.length && ` of ${clients.length}`}
        </p>
        <p className="text-[11px]" style={{ color: "var(--ink-5)" }}>
          Click column headers to sort
        </p>
      </div>

      <div
        className="rounded-xl bg-white overflow-hidden"
        style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
      >
        <table className="min-w-full text-[13px]">
          <thead style={{ background: "var(--paper)" }}>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <SortHeader
                onClick={() => toggleSort("health")}
                active={sortKey === "health"}
                dir={sortDir}
              >
                Health
              </SortHeader>
              <SortHeader
                onClick={() => toggleSort("company")}
                active={sortKey === "company"}
                dir={sortDir}
              >
                Company
              </SortHeader>
              <SortHeader
                onClick={() => toggleSort("plan")}
                active={sortKey === "plan"}
                dir={sortDir}
              >
                Plan
              </SortHeader>
              <Th>Status</Th>
              <Th>Active rounds</Th>
              <SortHeader
                onClick={() => toggleSort("last_activity")}
                active={sortKey === "last_activity"}
                dir={sortDir}
              >
                Last activity
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-10 text-center text-[13px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  No clients match the current filters.
                </td>
              </tr>
            ) : (
              visible.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/superadmin/clients/${c.id}`)}
                  className="cursor-pointer transition"
                  style={{ borderBottom: "1px solid var(--line)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <HealthDot health={c.health} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold" style={{ color: "var(--ink)" }}>
                      {c.company_name}
                    </div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--ink-4)" }}>
                      {c.client_code}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                    {c.plan_name || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusPill status={c.status} />
                  </td>
                  <td
                    className="px-4 py-3 whitespace-nowrap font-mono"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {c.active_round_count || 0}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
                    {formatLastActivity(c.last_activity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11.5px] font-semibold transition"
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "white" : "var(--ink-3)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line-2)",
        cursor: "pointer",
        textTransform: "capitalize",
      }}
    >
      {children}
    </button>
  );
}

function Th({ children }) {
  return (
    <th
      className="text-left px-4 py-2.5 font-bold uppercase"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--ink-4)",
      }}
    >
      {children}
    </th>
  );
}

function SortHeader({ children, onClick, active, dir }) {
  return (
    <th
      onClick={onClick}
      className="text-left px-4 py-2.5 font-bold uppercase cursor-pointer select-none"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: active ? "var(--ink)" : "var(--ink-4)",
      }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function HealthDot({ health }) {
  const colors = {
    good: { dot: "var(--pulse)", text: "var(--pulse-deep)" },
    attention: { dot: "var(--amber)", text: "#8C5E1F" },
    risk: { dot: "var(--coral)", text: "var(--coral)" },
    unknown: { dot: "var(--ink-4)", text: "var(--ink-4)" },
  };
  const c = colors[health.kind] || colors.unknown;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="rounded-full"
        style={{
          width: 9,
          height: 9,
          background: c.dot,
          boxShadow: health.kind === "risk" ? "0 0 0 3px rgba(217, 95, 73, 0.12)" : "none",
        }}
        aria-label={health.label}
      />
      <span className="text-[11.5px] font-medium" style={{ color: c.text }}>
        {health.label}
      </span>
    </span>
  );
}

function StatusPill({ status }) {
  const styles = {
    active: { bg: "var(--pulse-soft)", color: "var(--pulse-deep)" },
    pending: { bg: "var(--amber-soft)", color: "#8C5E1F" },
    inactive: { bg: "var(--coral-soft)", color: "var(--coral)" },
  };
  const s = styles[status] || { bg: "var(--paper-3)", color: "var(--ink-3)" };
  return (
    <span
      className="text-[10.5px] font-bold uppercase"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        padding: "2px 8px",
        borderRadius: 999,
        letterSpacing: "0.08em",
      }}
    >
      {status}
    </span>
  );
}

function formatLastActivity(dateStr) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
