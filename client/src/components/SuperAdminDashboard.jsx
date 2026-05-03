import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * SuperAdmin Dashboard — PR 7 of the SuperAdmin overhaul, per the
 * design handoff §1 ("Today" stack + filtered activity feed).
 *
 * Replaces the previous bare-totals dashboard (Total Clients, Active
 * Rounds, Total Responses, Board Members) with computed operational
 * signals the founder can act on immediately:
 *
 *   • Closing this week    — rounds whose response window closes ≤7d
 *   • Active rounds (+ Δ)  — current vs 7 days ago, contextualized
 *   • Dormant w/ active    — silent-churn signal (active round, dark admin)
 *   • Prompts pending      — recently regenerated, may need review
 *
 * Activity feed below the Today stack collapses repeated logins into a
 * single "+ N login events" rollup so meaningful events (round
 * launched, prompt regenerated, impersonation) aren't drowned out.
 *
 * Filter chips: All / Rounds / Prompts / Sessions / System / Impersonation.
 */

export default function SuperAdminDashboard() {
  const [stack, setStack] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([loadTodayStack(), loadActivity()]).finally(() => setLoading(false));
  }, []);

  const loadTodayStack = async () => {
    try {
      const res = await fetch("/api/superadmin/today-stack", { credentials: "include" });
      if (res.ok) setStack(await res.json());
    } catch (err) {
      console.error("Today-stack load error:", err);
    }
  };

  const loadActivity = async () => {
    try {
      const res = await fetch("/api/superadmin/activity-log?limit=50", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setActivity(data.entries || []);
      }
    } catch (err) {
      console.error("Activity load error:", err);
    }
  };

  // Categorize activity entries so the filter chips work.
  const categorize = (entry) => {
    if (entry.action === "login") return "logins";
    if (entry.action?.includes("round")) return "rounds";
    if (entry.action?.includes("prompt") || entry.action?.includes("supplement")) return "prompts";
    if (entry.action?.includes("interview") || entry.action?.includes("session")) return "sessions";
    if (entry.action?.includes("impersonat")) return "impersonation";
    return "system";
  };

  // Apply filter + collapse runs of consecutive login events from the
  // same actor into a single rollup row. This is the handoff's "logins
  // are de-emphasized — a quiet '+ N login events' rollup, not 20 rows."
  const visible = useMemo(() => {
    const filtered = activity.filter((e) => {
      const cat = categorize(e);
      if (filter === "all") return true;
      return cat === filter;
    });

    if (filter !== "all") return filtered.map((e) => ({ kind: "single", entry: e }));

    // Roll up consecutive logins.
    const out = [];
    let loginRun = null;
    for (const e of filtered) {
      if (categorize(e) === "logins") {
        if (loginRun) {
          loginRun.count += 1;
          loginRun.last = e.created_at;
        } else {
          loginRun = {
            kind: "login_rollup",
            count: 1,
            first: e.created_at,
            last: e.created_at,
            entries: [e],
          };
          out.push(loginRun);
        }
        loginRun.entries.push(e);
      } else {
        loginRun = null;
        out.push({ kind: "single", entry: e });
      }
    }
    return out;
  }, [activity, filter]);

  if (loading) {
    return (
      <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
        Loading dashboard…
      </p>
    );
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Today-stack section eyebrow */}
      <div>
        <SectionEyebrow>Today</SectionEyebrow>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
          Computed signals worth acting on this morning. Click any card to drill in.
        </p>
      </div>

      {/* Today-stack 4-up grid */}
      {stack && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ClosingCard data={stack.closing_this_week} navigate={navigate} />
          <ActiveRoundsCard data={stack.active_rounds} />
          <DormantCard data={stack.dormant_with_active} navigate={navigate} />
          <PromptsCard data={stack.prompts_recent} navigate={navigate} />
        </div>
      )}

      {/* Activity feed */}
      <div className="bg-white rounded-xl" style={{ border: "1px solid var(--line)" }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <SectionEyebrow>Activity</SectionEyebrow>
          <div className="flex" style={{ gap: 4 }}>
            {[
              { key: "all", label: "All" },
              { key: "rounds", label: "Rounds" },
              { key: "prompts", label: "Prompts" },
              { key: "sessions", label: "Sessions" },
              { key: "logins", label: "Logins" },
              { key: "impersonation", label: "Impersonation" },
              { key: "system", label: "System" },
            ].map((c) => {
              const active = filter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  className="text-[11.5px] font-semibold transition"
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "white" : "var(--ink-3)",
                    border: active ? "1px solid var(--ink)" : "1px solid var(--line-2)",
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-center py-8 text-[13px]" style={{ color: "var(--ink-4)" }}>
            No activity matches this filter.
          </p>
        ) : (
          <div>
            {visible.map((row, i) =>
              row.kind === "login_rollup" ? (
                <LoginRollup key={`r${i}`} rollup={row} />
              ) : (
                <ActivityRow key={row.entry.id} entry={row.entry} />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Today-stack cards
// ─────────────────────────────────────────────────────────────────────

function StackCard({ tone = "rules", title, value, sub, children }) {
  // Tone tints aligned with the prompt-block tones for visual consistency
  // across the SuperAdmin app: amber for caution, coral for risk, pulse
  // for healthy, plum for prompt-related.
  const tones = {
    rules: { bg: "white", border: "var(--line)", value: "var(--ink)", label: "var(--ink-3)" },
    pulse: {
      bg: "var(--pulse-tint)",
      border: "var(--pulse-soft)",
      value: "var(--pulse-deep)",
      label: "var(--pulse-deep)",
    },
    amber: {
      bg: "var(--amber-tint)",
      border: "var(--amber-soft)",
      value: "#8C5E1F",
      label: "#8C5E1F",
    },
    coral: {
      bg: "var(--coral-tint)",
      border: "var(--coral-soft)",
      value: "var(--coral)",
      label: "var(--coral)",
    },
    plum: {
      bg: "var(--plum-tint)",
      border: "var(--plum-soft)",
      value: "var(--plum)",
      label: "var(--plum)",
    },
  };
  const t = tones[tone] || tones.rules;
  return (
    <div
      className="rounded-xl"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        padding: 16,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="font-bold uppercase"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.12em",
          color: t.label,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        className="font-semibold"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 30,
          letterSpacing: "-0.02em",
          color: t.value,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[12px] mt-1" style={{ color: "var(--ink-3)", lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function ClosingCard({ data, navigate }) {
  const tone = data.count > 0 ? "amber" : "rules";
  return (
    <StackCard
      tone={tone}
      title="Closing this week"
      value={data.count}
      sub={
        data.count === 0
          ? "No rounds close in the next 7 days."
          : "Rounds whose response window closes within 7 days."
      }
    >
      {data.sample?.length > 0 && (
        <ul className="text-[12px]" style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>
          {data.sample.slice(0, 3).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => navigate(`/superadmin/clients/${r.client_id}`)}
                className="text-left underline"
                style={{
                  color: "var(--ink-2)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                {r.company_name} — Round {r.round_number} ({r.days_left}d)
              </button>
            </li>
          ))}
        </ul>
      )}
    </StackCard>
  );
}

function ActiveRoundsCard({ data }) {
  // Delta annotation. Bare zero is paired with context per handoff:
  // "Zero values must always be paired with context, never bare."
  let sub;
  if (data.count === 0 && data.last_week === 0) {
    sub = "No rounds in flight this week or last.";
  } else if (data.delta > 0) {
    sub = `Up ${data.delta} from last week (${data.last_week} active 7 days ago).`;
  } else if (data.delta < 0) {
    sub = `Down ${Math.abs(data.delta)} from last week (${data.last_week} active 7 days ago).`;
  } else {
    sub = `Flat vs last week (${data.last_week} active 7 days ago).`;
  }
  return (
    <StackCard
      tone={data.count > 0 ? "pulse" : "rules"}
      title="Active rounds"
      value={data.count}
      sub={sub}
    />
  );
}

function DormantCard({ data, navigate }) {
  const tone = data.count > 0 ? "coral" : "rules";
  return (
    <StackCard
      tone={tone}
      title="Dormant with active rounds"
      value={data.count}
      sub={
        data.count === 0
          ? "No silent-churn risk detected."
          : "Active rounds, but no admin login in 14+ days. Likely silent churn."
      }
    >
      {data.sample?.length > 0 && (
        <ul className="text-[12px]" style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>
          {data.sample.slice(0, 3).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(`/superadmin/clients/${c.id}`)}
                className="text-left underline"
                style={{
                  color: "var(--ink-2)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                {c.company_name}{" "}
                <span style={{ color: "var(--ink-4)" }}>
                  (
                  {c.last_login
                    ? "dark since " + new Date(c.last_login).toLocaleDateString()
                    : "never logged in"}
                  )
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </StackCard>
  );
}

function PromptsCard({ data, navigate }) {
  return (
    <StackCard
      tone={data.count > 0 ? "plum" : "rules"}
      title="Prompt versions (7d)"
      value={data.count}
      sub={
        data.count === 0
          ? "No prompt edits in the last 7 days."
          : "Recent prompt versions — review with the Test Interview runner before they hit boards."
      }
    >
      {data.count > 0 && (
        <button
          type="button"
          onClick={() => navigate("/superadmin/prompts")}
          className="text-[12px] font-semibold underline"
          style={{
            color: "var(--plum)",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Open Prompts library →
        </button>
      )}
    </StackCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activity rows
// ─────────────────────────────────────────────────────────────────────

const ACTION_LABELS = {
  login: "logged in",
  signup: "signed up",
  launch_round: "launched a survey round",
  start_interview: "started an onboarding interview",
  complete_interview: "completed an onboarding interview",
  abandon_interview: "skipped onboarding interview",
};

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

function ActivityRow({ entry }) {
  const dotColor = (() => {
    if (entry.actor_type === "superadmin") return "var(--plum)";
    if (entry.action === "launch_round") return "var(--pulse)";
    if (entry.action?.includes("prompt")) return "var(--plum)";
    if (entry.action?.includes("impersonat")) return "var(--coral)";
    return "var(--ink-4)";
  })();
  return (
    <div
      className="flex items-start gap-3 px-4 py-2.5 text-[13px]"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{
          width: 6,
          height: 6,
          background: dotColor,
          marginTop: 7,
        }}
      />
      <div className="flex-1 min-w-0">
        <span className="font-medium" style={{ color: "var(--ink-2)" }}>
          {entry.actor_email || "System"}
        </span>{" "}
        <span style={{ color: "var(--ink-3)" }}>{ACTION_LABELS[entry.action] || entry.action}</span>
        {entry.company_name && (
          <span style={{ color: "var(--ink-4)" }}> — {entry.company_name}</span>
        )}
      </div>
      <span className="text-[11.5px] font-mono flex-shrink-0" style={{ color: "var(--ink-4)" }}>
        {formatTime(entry.created_at)}
      </span>
    </div>
  );
}

function LoginRollup({ rollup }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-[12px]"
      style={{
        background: "var(--paper)",
        borderBottom: "1px solid var(--line)",
        color: "var(--ink-4)",
        fontStyle: "italic",
      }}
    >
      <span>
        + {rollup.count} login event{rollup.count === 1 ? "" : "s"}
      </span>
      <span className="font-mono">{formatTime(rollup.last)}</span>
    </div>
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
