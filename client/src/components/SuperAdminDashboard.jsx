import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * SuperAdmin Dashboard — final form per design handoff §1, screenshot
 * v2 (2026-05-03 feedback). Three sections, top to bottom:
 *
 *   1. Hero header        "Today, May 3" + "N signals · X clients · Y paying"
 *   2. 4 stat cards       small right-edge tone dot, big display number
 *   3. Signal cards       "What needs your attention" — colored left
 *                          border per severity, title + detail + CTA
 *   4. Activity table     4-column WHEN / EVENT / TARGET / ACTOR with
 *                          event-type pills; logins excluded by default
 *
 * The signal-card list IS the dashboard. The stat cards are scoreboard;
 * the signals tell the operator what to do.
 */

const ARROW = "→";

export default function SuperAdminDashboard() {
  const [stack, setStack] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([loadStack(), loadActivity("all")]).finally(() => setLoading(false));
  }, []);

  // Reload activity when the filter chip changes — we let the server do
  // the filter so the kind-pill column always matches what's rendered
  // (no client-side mismatch between "what was fetched" and "what's
  // shown after filter").
  useEffect(() => {
    loadActivity(filter);
  }, [filter]);

  const loadStack = async () => {
    try {
      const res = await fetch("/api/superadmin/today-stack", { credentials: "include" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        throw new Error(`today-stack returned ${res.status}`);
      }
      setStack(await res.json());
    } catch (err) {
      console.error("Today-stack load error:", err);
    }
  };

  const loadActivity = async (kind) => {
    try {
      const url =
        kind === "all"
          ? "/api/superadmin/activity-log?limit=20"
          : `/api/superadmin/activity-log?limit=20&kind=${encodeURIComponent(kind)}`;
      const res = await fetch(url, { credentials: "include" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        throw new Error(`activity-log returned ${res.status}`);
      }
      const data = await res.json();
      setActivity(data.entries || []);
    } catch (err) {
      console.error("Activity load error:", err);
    }
  };

  const heroDate = useMemo(() => {
    const d = new Date();
    return `Today, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, []);

  if (loading) {
    return (
      <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
        Loading dashboard…
      </p>
    );
  }

  const header = stack?.header || { signals_count: 0, clients_count: 0, paying_count: 0 };
  const signals = stack?.signals || [];

  return (
    <div className="space-y-6" style={{ fontFamily: "var(--font-sans)" }}>
      {/* ── 1. Hero header ────────────────────────────────────────── */}
      <div>
        <h1
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            lineHeight: 1.1,
          }}
        >
          {heroDate}
        </h1>
        <div className="text-[13px] mt-1.5" style={{ color: "var(--ink-3)" }}>
          {header.signals_count} {header.signals_count === 1 ? "signal needs" : "signals need"} your
          attention · {header.clients_count} {header.clients_count === 1 ? "client" : "clients"} ·{" "}
          {header.paying_count} paying
        </div>
      </div>

      {/* ── 2. Stat cards ─────────────────────────────────────────── */}
      {stack && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Closing this week"
            value={stack.closing_this_week.count}
            sub="Rounds with <7 days left"
            tone={stack.closing_this_week.count > 0 ? "attention" : "neutral"}
          />
          <StatCard
            label="Dormant w/ active round"
            value={stack.dormant_with_active.count}
            sub="Admin not seeing results"
            tone={stack.dormant_with_active.count > 0 ? "risk" : "neutral"}
          />
          <StatCard
            label="No round scheduled"
            value={stack.no_round_scheduled?.count ?? 0}
            sub="Of onboarded clients"
            tone={(stack.no_round_scheduled?.count ?? 0) > 3 ? "attention" : "neutral"}
          />
          <StatCard
            label="Active rounds"
            value={stack.active_rounds.count}
            sub={
              stack.active_rounds.count === 0 ? "No live interviews now" : "Currently collecting"
            }
            tone="neutral"
          />
        </div>
      )}

      {/* ── 3. Signal cards ───────────────────────────────────────── */}
      <div className="flex items-baseline justify-between mt-2">
        <SectionEyebrow>What needs your attention</SectionEyebrow>
        <div className="flex items-center" style={{ gap: 8 }}>
          <SeverityLegendPill severity="risk">Risk</SeverityLegendPill>
          <SeverityLegendPill severity="attention">Attention</SeverityLegendPill>
          <SeverityLegendPill severity="watch">Watch</SeverityLegendPill>
        </div>
      </div>

      {signals.length === 0 ? (
        <div
          className="rounded-xl bg-white text-center py-10"
          style={{ border: "1px solid var(--line)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--ink-4)" }}>
            Nothing to act on right now. All clients look healthy.
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {signals.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              onOpen={() => {
                if (s.cta === "Test prompt") {
                  navigate("/superadmin/prompts");
                } else if (s.client_id) {
                  navigate(`/superadmin/clients/${s.client_id}`);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* ── 4. Activity table ─────────────────────────────────────── */}
      <div className="flex items-baseline justify-between mt-4">
        <SectionEyebrow>Recent activity</SectionEyebrow>
        <div className="flex" style={{ gap: 6 }}>
          {[
            { key: "all", label: "All" },
            { key: "round", label: "Rounds" },
            { key: "prompt", label: "Prompts" },
            { key: "session", label: "Sessions" },
            { key: "impersonate", label: "Impersonations" },
            { key: "system", label: "System" },
          ].map((c) => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl bg-white overflow-hidden"
        style={{ border: "1px solid var(--line)" }}
      >
        <table className="min-w-full text-[13px]">
          <thead style={{ background: "var(--paper)" }}>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <Th width={90}>When</Th>
              <Th>Event</Th>
              <Th>Target</Th>
              <Th>Actor</Th>
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 ? (
              <tr>
                <td
                  colSpan="4"
                  className="px-4 py-10 text-center text-[13px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  No activity matches this filter.
                </td>
              </tr>
            ) : (
              activity.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td
                    className="px-4 py-2.5 font-mono text-[11.5px]"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {formatTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <EventPill kind={entry.kind} verb={entry.action} />
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--ink-2)" }}>
                    {entry.company_name || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {entry.actor_email || "system"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[11.5px]" style={{ color: "var(--ink-4)" }}>
        Logins are excluded from this view by default.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stat card (cleaner format — small right-edge tone dot, large number)
// ─────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, tone = "neutral" }) {
  const toneColor = tone === "risk" ? "var(--coral)" : tone === "attention" ? "var(--amber)" : null;
  return (
    <div
      className="rounded-xl bg-white"
      style={{
        border: "1px solid var(--line)",
        padding: "14px 16px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="font-bold uppercase"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.12em",
            color: "var(--ink-4)",
          }}
        >
          {label}
        </div>
        {toneColor && (
          <span
            className="rounded-full"
            style={{ width: 6, height: 6, background: toneColor }}
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className="font-medium"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 34,
          letterSpacing: "-0.02em",
          marginTop: 4,
          lineHeight: 1,
          color: "var(--ink)",
        }}
      >
        {value}
      </div>
      <div className="text-[12px] mt-1.5" style={{ color: "var(--ink-3)" }}>
        {sub}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Signal card (colored left border by severity)
// ─────────────────────────────────────────────────────────────────────

function SignalCard({ signal, onOpen }) {
  const sev = signal.severity;
  const borderColor =
    sev === "risk" ? "var(--coral)" : sev === "attention" ? "var(--amber)" : "var(--ink-4)";
  return (
    <div
      className="rounded-xl bg-white flex overflow-hidden"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      <div style={{ width: 5, background: borderColor, flexShrink: 0 }} aria-hidden="true" />
      <div className="flex items-center" style={{ flex: 1, padding: "14px 18px", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-semibold"
            style={{ fontSize: 14.5, color: "var(--ink)", marginBottom: 4 }}
          >
            {signal.title}
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--ink-3)", lineHeight: 1.55 }}>
            {signal.detail}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="font-semibold text-[12px] flex items-center gap-1 transition flex-shrink-0"
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            background: "white",
            color: "var(--ink-2)",
            border: "1px solid var(--line-2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {signal.cta} {ARROW}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Severity legend pill (top-right of "What needs your attention")
// ─────────────────────────────────────────────────────────────────────

function SeverityLegendPill({ severity, children }) {
  const dotColor =
    severity === "risk"
      ? "var(--coral)"
      : severity === "attention"
        ? "var(--amber)"
        : "var(--ink-4)";
  return (
    <span
      className="inline-flex items-center text-[10.5px] font-medium"
      style={{
        background: "var(--paper-2)",
        color: "var(--ink-3)",
        padding: "2px 8px",
        borderRadius: 999,
        gap: 5,
      }}
    >
      <span
        className="rounded-full"
        style={{ width: 6, height: 6, background: dotColor }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activity table — event pill + filter chip
// ─────────────────────────────────────────────────────────────────────

function EventPill({ kind, verb }) {
  // Color map matches the design handoff prototype's tones so the same
  // event categories read consistently across SuperAdmin surfaces.
  const styles = {
    session: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    round: { bg: "var(--paper-3)", color: "var(--ink)" },
    prompt: { bg: "var(--plum-tint)", color: "var(--plum)" },
    insight: { bg: "var(--amber-tint)", color: "#8C5E1F" },
    impersonate: { bg: "var(--coral-tint)", color: "var(--coral)" },
    login: { bg: "var(--paper-2)", color: "var(--ink-4)" },
    system: { bg: "var(--paper-2)", color: "var(--ink-3)" },
  };
  const s = styles[kind] || styles.system;
  const label = (verb || "").replace(/_/g, " ");
  return (
    <span
      className="inline-block font-semibold font-mono"
      style={{
        background: s.bg,
        color: s.color,
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 11.5,
      }}
    >
      {label}
    </span>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold transition"
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        background: active ? "var(--ink)" : "transparent",
        color: active ? "white" : "var(--ink-3)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line-2)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────

function Th({ children, width }) {
  return (
    <th
      className="text-left px-4 py-2.5 font-bold uppercase"
      style={{
        width,
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--ink-4)",
      }}
    >
      {children}
    </th>
  );
}

function SectionEyebrow({ children }) {
  return (
    <span
      className="font-bold uppercase"
      style={{
        fontSize: 11,
        letterSpacing: "0.14em",
        color: "var(--ink-4)",
      }}
    >
      {children}
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
