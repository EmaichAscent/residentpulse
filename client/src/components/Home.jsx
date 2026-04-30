import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";

/**
 * Home — strategic landing page for client admins.
 *
 * Replaces the previous rounds-list landing. Answers in 30 seconds:
 * what's the latest round verdict, what's at risk, what's coming up.
 *
 * Phase 3 PR1 ships the hero row + rounds timeline. The "This Quarter's
 * Brief" section (org-wide patterns) and live activity feed are
 * placeholder-only here — they ship as part of Actions (PR2) and a later
 * activity-feed PR.
 */
export default function Home() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [latestDashboard, setLatestDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/survey-rounds", { credentials: "include" });
        if (!r.ok) throw new Error("Failed to load rounds");
        const list = await r.json();
        if (cancelled) return;
        setRounds(list);

        const latestConcluded = [...list]
          .filter((rd) => rd.status === "concluded")
          .sort((a, b) => b.round_number - a.round_number)[0];

        if (latestConcluded) {
          const d = await fetch(`/api/admin/survey-rounds/${latestConcluded.id}/dashboard`, {
            credentials: "include",
          });
          if (d.ok && !cancelled) setLatestDashboard(await d.json());
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="text-center text-gray-400 py-10" data-testid="home-loading">
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-center text-red-500 py-10" data-testid="home-error">
        {error}
      </p>
    );
  }

  const concluded = rounds.filter((r) => r.status === "concluded");
  const inProgress = rounds.find((r) => r.status === "in_progress");
  const planned = rounds
    .filter((r) => r.status === "planned")
    .sort((a, b) => a.round_number - b.round_number);

  const latestConcluded = [...concluded].sort((a, b) => b.round_number - a.round_number)[0];

  const hasAnyHistory = concluded.length > 0 || inProgress;

  return (
    <div className="space-y-8">
      <Greeting user={user} latestConcluded={latestConcluded} />

      {!hasAnyHistory ? (
        <EmptyState navigate={navigate} planned={planned} />
      ) : (
        <>
          <HeroRow latestDashboard={latestDashboard} concluded={concluded} />
          <BriefPlaceholder />
          <SurveyRoundsTimeline
            inProgress={inProgress}
            concluded={concluded}
            planned={planned}
            navigate={navigate}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────

function Greeting({ user, latestConcluded }) {
  const today = new Date();
  const dateStr = today
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  const firstName = user?.first_name || (user?.email || "").split("@")[0] || "there";
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <p
        className="text-[11px] font-semibold tracking-wider mb-1"
        style={{ color: "var(--ink-4)", letterSpacing: "0.12em" }}
      >
        {dateStr}
      </p>
      <h1
        className="font-display"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "32px",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
          marginBottom: 6,
        }}
      >
        {greeting}, {firstName}.
      </h1>
      {latestConcluded && (
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          Round {latestConcluded.round_number} just closed. Here's what needs your attention.
        </p>
      )}
      {!latestConcluded && (
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          No rounds have closed yet. Once your first round concludes, this is where the verdict
          lands.
        </p>
      )}
    </div>
  );
}

function HeroRow({ latestDashboard, concluded }) {
  const nps = latestDashboard?.nps?.score;
  const respondedCount = latestDashboard?.response_rate?.completed ?? 0;
  const invitedCount = latestDashboard?.response_rate?.invited ?? 0;
  const responseRate = latestDashboard?.response_rate?.percentage ?? 0;
  const isPaid = !!latestDashboard?.is_paid_tier;
  const revenueAtRisk = latestDashboard?.community_analytics?.revenue_at_risk;

  // NPS comparison: previous concluded round
  const prior = [...concluded].sort((a, b) => b.round_number - a.round_number).slice(1, 4);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>
      <Card>
        <SectionHeader>Portfolio NPS</SectionHeader>
        <div className="flex items-baseline gap-3 mt-2">
          <span
            className="font-display"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 64,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              color: nps == null ? "var(--ink-4)" : "var(--ink)",
              lineHeight: 1,
            }}
          >
            {nps == null ? "—" : nps > 0 ? `+${nps}` : nps}
          </span>
          {prior.length > 0 && (
            <span className="text-xs font-mono" style={{ color: "var(--ink-3)" }}>
              {prior.map((r) => (
                <span key={r.id} className="inline-block ml-2">
                  R{r.round_number} <span style={{ color: "var(--ink-4)" }}>(history)</span>
                </span>
              ))}
            </span>
          )}
        </div>
        {nps != null && (
          <p className="text-xs mt-2" style={{ color: "var(--ink-3)" }}>
            {nps >= 30
              ? "Strong promoter share. Look for what's working."
              : nps >= 0
                ? "Mixed signal. Detractors deserve attention."
                : "Detractor-heavy. Read the warnings."}
          </p>
        )}
      </Card>

      <Card>
        <SectionHeader>Response rate</SectionHeader>
        <div className="flex items-baseline gap-2 mt-2">
          <span
            className="font-display"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 44,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              color: "var(--ink)",
              lineHeight: 1,
            }}
          >
            {responseRate}%
          </span>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--ink-3)" }}>
          {respondedCount} of {invitedCount} board members responded.
        </p>
      </Card>

      <Card>
        <SectionHeader>Revenue at risk</SectionHeader>
        {!isPaid ? (
          <div className="mt-2">
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              Available on paid plans. Upgrade to see at-risk contract value across detractor
              communities.
            </p>
          </div>
        ) : revenueAtRisk == null ? (
          <p className="text-sm mt-2" style={{ color: "var(--ink-3)" }}>
            No revenue data yet — add contract values to communities.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className="font-display"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 44,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: "var(--coral)",
                  lineHeight: 1,
                }}
              >
                ${formatCompact(revenueAtRisk.at_risk_value)}
              </span>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--ink-3)" }}>
              {revenueAtRisk.percent_at_risk}% of $
              {formatCompact(revenueAtRisk.total_portfolio_value)} portfolio across detractor
              communities.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function BriefPlaceholder() {
  return (
    <Card style={{ background: "var(--paper-2)" }}>
      <SectionHeader>This quarter's brief</SectionHeader>
      <p className="text-sm mt-3" style={{ color: "var(--ink-3)" }}>
        Coming soon: 1–3 ranked picks of the org-wide patterns most worth acting on this quarter,
        derived from response analytics. Until then, dig into the round results directly.
      </p>
    </Card>
  );
}

function SurveyRoundsTimeline({ inProgress, concluded, planned, navigate }) {
  const all = [...concluded, inProgress, ...planned].filter(Boolean);

  return (
    <Card>
      <SectionHeader>Survey rounds</SectionHeader>
      <div className="mt-3 space-y-2">
        {all.map((r) => (
          <RoundRow key={r.id} round={r} onOpen={() => navigate(`/admin/rounds/${r.id}`)} />
        ))}
        {all.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            No rounds scheduled yet.
          </p>
        )}
      </div>
    </Card>
  );
}

function RoundRow({ round, onOpen }) {
  const status = round.status;
  const pillStyle =
    status === "concluded"
      ? { bg: "var(--leaf-tint)", fg: "var(--pulse-deep)" }
      : status === "in_progress"
        ? { bg: "var(--amber-tint)", fg: "#8C5E1F" }
        : { bg: "var(--paper-2)", fg: "var(--ink-3)" };
  const label =
    status === "concluded" ? "Concluded" : status === "in_progress" ? "In progress" : "Planned";

  const date = round.concluded_at || round.launched_at || round.scheduled_date;
  const dateStr = date ? new Date(date).toLocaleDateString() : "—";

  return (
    <div
      className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border transition cursor-pointer"
      style={{ borderColor: "var(--line)", backgroundColor: "white" }}
      onClick={status === "planned" ? undefined : onOpen}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: pillStyle.bg, color: pillStyle.fg }}
        >
          R{round.round_number}
        </span>
        <span className="text-sm" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        <span className="text-xs" style={{ color: "var(--ink-4)" }}>
          {dateStr}
        </span>
      </div>
      {status === "concluded" && round.responses_completed != null && (
        <span className="text-xs font-mono" style={{ color: "var(--ink-3)" }}>
          {round.responses_completed} responses
        </span>
      )}
      {status === "in_progress" && round.closes_at && (
        <span className="text-xs" style={{ color: "var(--coral)" }}>
          Closes {new Date(round.closes_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function EmptyState({ navigate, planned }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--ink)" }}>
        No rounds yet
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-3)" }}>
        {planned.length > 0
          ? `Your first round is scheduled. Once it launches and closes, the verdict shows up here.`
          : `Schedule your first survey round to start collecting feedback.`}
      </p>
      <button
        className="text-sm px-4 py-2 rounded-lg text-white font-semibold"
        style={{ backgroundColor: "var(--pulse)" }}
        onClick={() => navigate("/admin/rounds")}
      >
        Open Rounds
      </button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--line)", backgroundColor: "white", ...style }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase"
      style={{
        color: "var(--ink-4)",
        letterSpacing: "0.12em",
      }}
    >
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function formatCompact(num) {
  if (num == null) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return Math.round(num).toString();
}
