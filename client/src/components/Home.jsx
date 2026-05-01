import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { NpsGauge, Sparkline } from "./charts/NpsCharts";

/**
 * Home — strategic landing page for client admins.
 *
 * Layout matches DESIGN/design_handoff_clientapp/src/screens/Home.jsx:
 *
 *   1. Greeting header — date / "Good morning, {firstName}." / "Round N
 *      just closed. Here's what needs your attention." + Export +
 *      View full results
 *   2. Hero row (1.2fr 1fr 1fr) — Portfolio NPS w/ NpsGauge / Response
 *      rate w/ Sparkline / Revenue at risk
 *   3. "This quarter, 3 things would move the needle most" — top 3
 *      recommended actions from the latest concluded round, each with
 *      mentions / communities / NPS-when-raised metrics + accept-state
 *      indicator
 *   4. Two columns: Survey Rounds timeline | Recent Activity feed
 *
 * Empty states:
 *   • No concluded round yet → simple "Schedule your first round" CTA
 *     in place of the hero row
 *   • No insights on latest round → hero row still shows raw metrics,
 *     brief section shows "Generate analysis" prompt
 */
export default function Home() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [latestDashboard, setLatestDashboard] = useState(null);
  const [account, setAccount] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cadenceUpdating, setCadenceUpdating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, aRes, actRes] = await Promise.all([
        fetch("/api/admin/survey-rounds", { credentials: "include" }),
        fetch("/api/admin/account", { credentials: "include" }),
        fetch("/api/admin/survey-rounds/recent-activity?limit=5", {
          credentials: "include",
        }),
      ]);
      if (!rRes.ok) throw new Error("Failed to load rounds");
      const list = await rRes.json();
      setRounds(list);
      if (aRes.ok) setAccount(await aRes.json());
      if (actRes.ok) setRecentActivity(await actRes.json());

      const latestConcluded = [...list]
        .filter((rd) => rd.status === "concluded")
        .sort((a, b) => b.round_number - a.round_number)[0];
      if (latestConcluded) {
        const d = await fetch(`/api/admin/survey-rounds/${latestConcluded.id}/dashboard`, {
          credentials: "include",
        });
        if (d.ok) setLatestDashboard(await d.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCadenceChange = async (newCadence) => {
    if (cadenceUpdating || newCadence === account?.survey_cadence) return;
    setCadenceUpdating(true);
    try {
      const res = await fetch("/api/admin/account/cadence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ survey_cadence: newCadence }),
      });
      if (res.ok) await loadAll();
    } finally {
      setCadenceUpdating(false);
    }
  };

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

  const concluded = rounds
    .filter((r) => r.status === "concluded")
    .sort((a, b) => b.round_number - a.round_number);
  const inProgress = rounds.find((r) => r.status === "in_progress");
  const planned = rounds
    .filter((r) => r.status === "planned")
    .sort((a, b) => a.round_number - b.round_number);
  const latestConcluded = concluded[0];
  const hasAnyHistory = concluded.length > 0 || inProgress;

  return (
    <div className="space-y-3.5" data-testid="home">
      {/* 1. GREETING HEADER */}
      <Greeting user={user} latestConcluded={latestConcluded} navigate={navigate} />

      {!hasAnyHistory ? (
        <EmptyState navigate={navigate} planned={planned} />
      ) : (
        <>
          {/* 2. HERO ROW */}
          <HeroRow
            latestConcluded={latestConcluded}
            latestDashboard={latestDashboard}
            concluded={concluded}
            navigate={navigate}
          />

          {/* 3. ACTIONS BRIEF */}
          <BriefSection
            picks={latestDashboard?.recommended_actions_status || []}
            navigate={navigate}
          />

          {/* 4. TWO-COL: Rounds + Activity */}
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <SurveyRoundsCard
              concluded={concluded}
              inProgress={inProgress}
              planned={planned}
              cadence={account?.survey_cadence || 2}
              maxCadence={account?.max_survey_cadence || 2}
              onCadenceChange={handleCadenceChange}
              cadenceUpdating={cadenceUpdating}
              navigate={navigate}
            />
            <ActivityCard activity={recentActivity} />
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Greeting header
// ──────────────────────────────────────────────────────────────────────

function Greeting({ user, latestConcluded, navigate }) {
  const dateLabel = new Date()
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();
  const firstName = user?.first_name || "there";
  const subtitle = latestConcluded
    ? `Round ${latestConcluded.round_number} just closed. Here's what needs your attention.`
    : "Schedule your first round to start collecting board feedback.";
  return (
    <div className="flex items-start justify-between gap-4 mb-1" data-testid="home-greeting">
      <div>
        <div
          className="text-[11px] font-semibold uppercase mb-1"
          style={{ letterSpacing: "0.12em", color: "var(--ink-3)" }}
        >
          {dateLabel}
        </div>
        <h1
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Good {timeOfDayGreeting()}, {firstName}.
        </h1>
        <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
          {subtitle}
        </div>
      </div>
      {latestConcluded && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate(`/admin/rounds/${latestConcluded.id}`)}
            className="btn-pulse"
            type="button"
          >
            View full results
          </button>
        </div>
      )}
    </div>
  );
}

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

// ──────────────────────────────────────────────────────────────────────
// Hero row — Portfolio NPS, Response Rate, Revenue at Risk
// ──────────────────────────────────────────────────────────────────────

function HeroRow({ latestConcluded, latestDashboard, concluded, navigate }) {
  const insights = latestDashboard?.insights;
  const nps = latestDashboard?.nps;
  const npsScore = nps?.score ?? insights?.nps_score ?? null;

  // Round-over-round NPS series for the strip and trendline copy.
  const roundsAsc = [...concluded].sort((a, b) => a.round_number - b.round_number);
  const npsSeries = roundsAsc
    .map((r) => ({ round: r.round_number, nps: extractNps(r) }))
    .filter((p) => p.nps != null);
  const prevNps = npsSeries.length >= 2 ? npsSeries[npsSeries.length - 2].nps : null;
  const npsDelta = npsScore != null && prevNps != null ? npsScore - prevNps : null;

  // Trend copy: "Trending up for 2 rounds. Crossing zero by Q3 if pace holds."
  const trendCopy = trendCommentary(npsSeries);

  // Response rate
  const responseRate = latestDashboard?.response_rate;
  const respPct = responseRate?.percentage ?? null;
  const responseTrend = roundsAsc
    .map((r) => {
      const total = Number(r.members_invited || r.invitations_sent || 0);
      const completed = Number(r.responses_completed || 0);
      return total > 0 ? Math.round((completed / total) * 100) : null;
    })
    .filter((v) => v != null);
  const prevResp = responseTrend.length >= 2 ? responseTrend[responseTrend.length - 2] : null;
  const respDelta = respPct != null && prevResp != null ? respPct - prevResp : null;

  // Revenue at risk
  const rar = latestDashboard?.community_analytics?.revenue_at_risk;

  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>
      {/* NPS card */}
      <Card padding={24}>
        <div className="flex justify-between items-start gap-3 min-w-0">
          <div className="min-w-0">
            <div
              className="text-[11px] font-semibold uppercase"
              style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
            >
              Portfolio NPS — Round {latestConcluded?.round_number}
            </div>
            <div className="flex items-baseline gap-3 mt-1.5">
              <span
                className="font-medium"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 64,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: "var(--ink)",
                }}
              >
                {npsScore != null ? formatNps(npsScore) : "—"}
              </span>
              {npsDelta != null && (
                <DeltaPill
                  value={npsDelta}
                  suffix={`vs Round ${prevNps != null ? npsSeries[npsSeries.length - 2].round : ""}`}
                />
              )}
            </div>
            {trendCopy && (
              <div className="text-[13px] mt-1.5" style={{ color: "var(--ink-3)" }}>
                {trendCopy}
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            <NpsGauge value={npsScore ?? 0} prev={prevNps} size={140} />
          </div>
        </div>
        <div
          className="flex gap-4 pt-3 mt-3 text-[12px]"
          style={{ borderTop: "1px solid var(--line)" }}
        >
          {npsSeries.slice(-3).map((p) => (
            <div key={p.round}>
              <span style={{ color: "var(--ink-4)" }}>R{p.round}</span>{" "}
              <span
                className="font-mono font-semibold"
                style={{
                  color: p.nps === npsScore ? "var(--pulse-deep)" : "var(--ink)",
                }}
              >
                {formatNps(p.nps)}
              </span>
            </div>
          ))}
          <div className="ml-auto" style={{ color: "var(--ink-3)" }}>
            Industry median: +12
          </div>
        </div>
      </Card>

      {/* Response rate */}
      <Card padding={24}>
        <div
          className="text-[11px] font-semibold uppercase"
          style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
        >
          Response rate
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 44,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {respPct != null ? respPct : "—"}
            <span style={{ fontSize: 24, color: "var(--ink-3)" }}>%</span>
          </span>
          {respDelta != null && (
            <span
              className="text-[12px] font-semibold"
              style={{
                color: respDelta >= 0 ? "var(--pulse-deep)" : "var(--coral)",
              }}
            >
              {respDelta > 0 ? "+" : ""}
              {respDelta}pp
            </span>
          )}
        </div>
        <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
          {responseRate
            ? `${responseRate.completed} of ${responseRate.invited} board members`
            : "—"}
        </div>
        {responseTrend.length >= 2 && (
          <div className="mt-4">
            <Sparkline data={responseTrend} width={240} height={36} color="var(--ink)" />
            <div
              className="flex justify-between mt-1 text-[10.5px]"
              style={{ color: "var(--ink-4)" }}
            >
              {responseTrend.slice(-3).map((v, i, arr) => (
                <span key={i}>
                  R{npsSeries[npsSeries.length - arr.length + i]?.round || i + 1} {v}%
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Revenue at risk */}
      <Card
        padding={24}
        style={{
          background: "linear-gradient(180deg, white 0%, var(--coral-tint) 200%)",
        }}
      >
        <div className="flex justify-between items-center">
          <div
            className="text-[11px] font-semibold uppercase"
            style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
          >
            Revenue at risk
          </div>
          <span style={{ color: "var(--coral)", fontSize: 14 }} aria-hidden="true">
            🔥
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span
            className="font-medium"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 44,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--coral)",
            }}
          >
            {rar?.at_risk_value != null ? formatCurrencyCompact(rar.at_risk_value) : "—"}
          </span>
        </div>
        <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
          {rar?.percent_at_risk != null && rar?.total_portfolio_value != null
            ? `${rar.percent_at_risk}% of ${formatCurrencyCompact(rar.total_portfolio_value)} ARR · ${(rar.at_risk_communities || []).length} communities`
            : "Revenue data unavailable for this plan."}
        </div>
        {latestConcluded && (
          <button
            onClick={() => navigate(`/admin/rounds/${latestConcluded.id}`)}
            className="btn-ghost mt-4"
            style={{ width: "100%", justifyContent: "center" }}
            type="button"
          >
            See at-risk communities →
          </button>
        )}
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Brief section — top 3 recommended actions
// ──────────────────────────────────────────────────────────────────────

function BriefSection({ picks, navigate }) {
  if (!picks || picks.length === 0) {
    return (
      <Card padding={22}>
        <div className="flex items-center gap-3 mb-1.5">
          <SparkleBadge />
          <div className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
            This quarter, the AI hasn't surfaced action picks yet
          </div>
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Conclude a round and generate insights to see the highest-leverage moves here.
        </p>
      </Card>
    );
  }

  const top3 = picks.slice(0, 3);
  const decisionsLogged = top3.filter(
    (p) => p.decision === "accepted" || p.logged_action_id != null
  ).length;

  return (
    <div
      className="rounded-2xl bg-white overflow-hidden"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-3">
          <SparkleBadge />
          <div>
            <div
              className="font-semibold text-[14px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              This quarter, 3 things would move the needle most
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--ink-3)" }}>
              Org-wide patterns · {decisionsLogged} of {top3.length} have an action logged
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/admin/actions")}
          type="button"
          className="px-3.5 py-2 text-[13px] font-semibold rounded-lg text-white transition"
          style={{ backgroundColor: "var(--ink)" }}
        >
          Open Actions →
        </button>
      </div>
      <div>
        {top3.map((pick, i) => (
          <BriefRow key={i} pick={pick} index={i} isLast={i === top3.length - 1} />
        ))}
      </div>
    </div>
  );
}

function BriefRow({ pick, index, isLast }) {
  const mentions = pick.mentions ?? pick.affected_count ?? null;
  const communities = pick.community_count ?? null;
  const npsWhenRaised = pick.nps_when_raised ?? null;
  const isAccepted = pick.decision === "accepted";
  const isLogged = pick.logged_action_id != null;
  const status = pick.logged_action_status;
  const statusLabel = isLogged
    ? status === "completed"
      ? "Completed"
      : "In progress"
    : isAccepted
      ? "Accepted"
      : pick.decision === "rejected"
        ? "Rejected"
        : "Pending decision";
  const statusColor = isLogged
    ? status === "completed"
      ? "var(--pulse-deep)"
      : "var(--ink-2)"
    : isAccepted
      ? "var(--pulse-deep)"
      : pick.decision === "rejected"
        ? "var(--ink-4)"
        : "var(--coral)";

  return (
    <div
      className="grid items-center gap-4 px-5 py-4"
      style={{
        gridTemplateColumns: "28px 1fr auto",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <div
        className="text-center"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 500,
          color: "var(--ink-3)",
          lineHeight: 1,
        }}
      >
        {index + 1}
      </div>
      <div>
        <div
          className="font-semibold text-[14px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          {truncateText(pick.action, 100)}
        </div>
        <div className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>
          {mentions != null && (
            <>
              <span className="font-semibold" style={{ color: "var(--ink-2)" }}>
                {mentions}
              </span>{" "}
              mentions
            </>
          )}
          {communities != null && (
            <>
              {" · "}
              <span className="font-semibold" style={{ color: "var(--ink-2)" }}>
                {communities} communities
              </span>
            </>
          )}
          {npsWhenRaised != null && (
            <>
              {" · NPS "}
              <span
                className="font-semibold"
                style={{
                  color:
                    npsWhenRaised <= 6
                      ? "var(--coral)"
                      : npsWhenRaised >= 9
                        ? "var(--pulse-deep)"
                        : "var(--amber)",
                }}
              >
                {npsWhenRaised}
              </span>{" "}
              when raised
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11.5px] font-semibold" style={{ color: statusColor }}>
          {statusLabel}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Survey rounds card (left column of bottom row)
// ──────────────────────────────────────────────────────────────────────

function SurveyRoundsCard({
  concluded,
  inProgress,
  planned,
  cadence,
  maxCadence,
  onCadenceChange,
  cadenceUpdating,
  navigate,
}) {
  const allRounds = [
    ...concluded.slice().reverse(), // ascending
    ...(inProgress ? [inProgress] : []),
    ...planned,
  ];
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Survey rounds
        </h3>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            Cadence
          </span>
          <div
            className="inline-flex rounded-lg p-0.5"
            style={{ backgroundColor: "var(--paper-2)", border: "1px solid var(--line)" }}
          >
            {[2, 4].map((n) => {
              const active = cadence === n;
              const disabled = cadenceUpdating || n > maxCadence;
              return (
                <button
                  key={n}
                  onClick={() => !active && !disabled && onCadenceChange(n)}
                  disabled={disabled}
                  type="button"
                  className="px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition disabled:opacity-50"
                  style={{
                    backgroundColor: active ? "var(--ink)" : "transparent",
                    color: active ? "white" : "var(--ink-3)",
                  }}
                >
                  {n}×/yr
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col" style={{ position: "relative" }}>
        {/* Timeline spine */}
        <div
          style={{
            position: "absolute",
            left: 13,
            top: 12,
            bottom: 12,
            width: 2,
            backgroundColor: "var(--line)",
          }}
        />
        {allRounds.map((r) => {
          const isConcluded = r.status === "concluded";
          const isInProgress = r.status === "in_progress";
          const isNextPlanned =
            r.status === "planned" && planned.length > 0 && r.id === planned[0].id;
          const sd = r.scheduled_date ? new Date(r.scheduled_date) : null;
          const startEnd =
            isConcluded && r.launched_at
              ? `${formatShortDate(r.launched_at)} → ${formatShortDate(r.concluded_at || r.closes_at)}`
              : sd
                ? `Scheduled for ${formatShortDate(sd)}`
                : "";
          const responses = r.responses_completed || 0;
          const total = r.members_invited || r.invitations_sent || 0;
          const pct = total > 0 ? Math.round((responses / total) * 100) : 0;
          const nps = extractNps(r);

          return (
            <div
              key={r.id}
              className="grid items-center gap-3 py-2.5"
              style={{
                gridTemplateColumns: "28px 1fr auto",
                position: "relative",
              }}
            >
              <div
                className="rounded-full flex items-center justify-center font-bold text-[11px]"
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: isConcluded || isInProgress ? "var(--pulse)" : "white",
                  color: isConcluded || isInProgress ? "white" : "var(--ink-4)",
                  border: isConcluded || isInProgress ? "none" : "1.5px dashed var(--line-2)",
                  zIndex: 1,
                }}
              >
                {r.round_number}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
                    Round {r.round_number}
                  </span>
                  <Pill variant={isConcluded ? "good" : isInProgress ? "live" : "neutral"}>
                    {isConcluded ? "Concluded" : isInProgress ? "Live" : "Planned"}
                  </Pill>
                  {isConcluded && r.active_alert_count > 0 && (
                    <Pill variant="warn">{r.active_alert_count} warnings</Pill>
                  )}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {isConcluded ? (
                    <>
                      <span className="font-mono">{startEnd}</span>
                      {" · "}
                      {responses}/{total} responses ({pct}%) · NPS{" "}
                      {nps != null ? formatNps(nps) : "—"}
                    </>
                  ) : (
                    <span className="font-mono">{startEnd}</span>
                  )}
                </div>
              </div>
              <div>
                {isConcluded ? (
                  <button
                    onClick={() => navigate(`/admin/rounds/${r.id}`)}
                    className="btn-ghost-sm"
                    type="button"
                  >
                    View
                  </button>
                ) : isInProgress ? (
                  <button
                    onClick={() => navigate(`/admin/rounds/${r.id}`)}
                    className="btn-ghost-sm"
                    type="button"
                  >
                    Live →
                  </button>
                ) : isNextPlanned ? (
                  <button
                    onClick={() => navigate("/admin/rounds")}
                    className="btn-pulse-sm"
                    type="button"
                  >
                    Launch now
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/admin/rounds")}
                    className="btn-ghost-sm"
                    type="button"
                  >
                    Reschedule
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Recent activity card
// ──────────────────────────────────────────────────────────────────────

function ActivityCard({ activity }) {
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Recent activity
        </h3>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
          style={{ color: "var(--pulse-deep)" }}
        >
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "var(--pulse)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          Live
        </span>
      </div>
      {activity.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          No recent responses yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {activity.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ActivityRow({ a }) {
  const initials =
    `${(a.first_name || "").charAt(0)}${(a.last_name || "").charAt(0)}`.toUpperCase() || "?";
  const toneColor =
    a.tone === "good" ? "var(--pulse)" : a.tone === "bad" ? "var(--coral)" : "var(--amber)";
  const fullName = [a.first_name, a.last_name].filter(Boolean).join(" ") || "Anonymous";
  const verbiage = `gave a${a.nps_score === 8 ? "n " : " "}${a.nps_score}${a.flagged ? " — flagged" : ""}`;
  return (
    <div className="flex gap-2.5 items-start">
      <div
        className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
        style={{
          width: 26,
          height: 26,
          backgroundColor: toneColor,
          fontSize: 10,
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-[13px]" style={{ lineHeight: 1.4 }}>
          <span className="font-semibold" style={{ color: "var(--ink)" }}>
            {fullName}
          </span>
          {a.community_name && (
            <>
              <span style={{ color: "var(--ink-3)" }}> at </span>
              <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{a.community_name}</span>
            </>
          )}{" "}
          <span style={{ color: "var(--ink-3)" }}>{verbiage}</span>
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-4)" }}>
          {formatRelativeTime(a.created_at)}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────────────────────────

function EmptyState({ navigate, planned }) {
  return (
    <Card padding={32}>
      <div className="text-center max-w-md mx-auto">
        <div
          className="font-medium mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.015em",
          }}
        >
          No survey rounds yet
        </div>
        <p className="text-[13px] mb-5" style={{ color: "var(--ink-3)" }}>
          Schedule your first round to send invitations to your board members. After it concludes,
          this page becomes your at-a-glance command center.
        </p>
        <button onClick={() => navigate("/admin/rounds")} className="btn-pulse" type="button">
          {planned.length > 0 ? "View planned rounds →" : "Schedule first round →"}
        </button>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inline shared bits
// ──────────────────────────────────────────────────────────────────────

function Card({ children, padding = 22, style }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function DeltaPill({ value, suffix }) {
  const isPositive = value > 0;
  return (
    <span
      className="inline-flex items-center gap-1 text-[13px] font-semibold rounded-full"
      style={{
        backgroundColor: isPositive ? "var(--pulse-tint)" : "var(--coral-tint)",
        color: isPositive ? "var(--pulse-deep)" : "var(--coral)",
        padding: "4px 10px",
      }}
    >
      {isPositive ? "↑ +" : "↓ "}
      {value}
      {suffix && (
        <span className="ml-0.5 font-normal" style={{ opacity: 0.85 }}>
          {" "}
          {suffix}
        </span>
      )}
    </span>
  );
}

function Pill({ children, variant = "neutral" }) {
  const colors = {
    good: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    warn: { bg: "var(--coral-tint)", color: "var(--coral)" },
    live: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    neutral: { bg: "var(--paper-3)", color: "var(--ink-3)" },
  }[variant];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase"
      style={{ backgroundColor: colors.bg, color: colors.color, letterSpacing: "0.06em" }}
    >
      {children}
    </span>
  );
}

function SparkleBadge() {
  return (
    <div
      className="rounded-md flex items-center justify-center"
      style={{ width: 30, height: 30, backgroundColor: "var(--ink)", color: "var(--pulse)" }}
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
        <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function extractNps(round) {
  if (typeof round.insights_json === "object" && round.insights_json) {
    const n = round.insights_json.nps_score;
    if (typeof n === "number") return n;
  }
  return null;
}

function formatNps(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatCurrencyCompact(val) {
  if (val == null) return "$0";
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (val >= 1_000) {
    return `$${Math.round(val / 1_000)}k`;
  }
  return `$${val}`;
}

function formatShortDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function truncateText(s, max) {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Trend commentary — single-sentence narrative for the NPS card.
 * Looks at the slope of the most recent N rounds and produces copy
 * like "Trending up for 2 rounds" or "Down 5 points since R1".
 *
 * Returns null when there isn't enough data for a meaningful trend.
 */
function trendCommentary(npsSeries) {
  if (!npsSeries || npsSeries.length < 2) return null;
  const last = npsSeries[npsSeries.length - 1].nps;
  let upStreak = 0;
  for (let i = npsSeries.length - 1; i > 0; i--) {
    if (npsSeries[i].nps > npsSeries[i - 1].nps) upStreak++;
    else break;
  }
  let downStreak = 0;
  for (let i = npsSeries.length - 1; i > 0; i--) {
    if (npsSeries[i].nps < npsSeries[i - 1].nps) downStreak++;
    else break;
  }
  if (upStreak >= 2) {
    return last < 0
      ? `Trending up for ${upStreak} rounds. Crossing zero soon if pace holds.`
      : `Trending up for ${upStreak} rounds.`;
  }
  if (downStreak >= 2) {
    return `Down for ${downStreak} rounds — worth a closer look.`;
  }
  return null;
}
