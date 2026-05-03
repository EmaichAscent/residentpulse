import { useState, useEffect } from "react";
import { NpsLineChart, StackedSentimentBars } from "./charts/NpsCharts";
import InfoTip from "./InfoTip";
import {
  baseStyles,
  brandBar,
  toolbar,
  footer,
  npsLineSvg,
  stackedSentimentSvg,
  revenueRiskSvg,
  horizontalBarsSvg,
  renderTable,
  npsHex,
  formatShortDate as formatShort,
  escapeHtml,
  openReportWindow,
  V2_PALETTE as PdfC,
} from "../utils/pdfReport";

/**
 * Trends — round-over-round delta dashboard. Full rebuild matching
 * DESIGN/design_handoff_clientapp/src/screens/Trends.jsx.
 *
 * Sections:
 *   1. Header — title + date range + filters / export
 *   2. Headline story (plum sparkle) — narrative deltas summary
 *   3. NPS over time (NpsLineChart)
 *   4. Cohort movement (StackedSentimentBars) | Response rate side-by-side
 *   5. Trending topics: Rising | Fading
 *   6. Communities improving most | Communities declining most
 *   7. Manager + Location deltas (in one card)
 *
 * Data: GET /api/admin/survey-rounds/trends returns per-round
 * { nps_score, promoters, passives, detractors, response_rate,
 *   community_details, word_frequencies, manager_performance,
 *   location_performance }. Everything else is computed client-side
 *   (deltas, biggest movers, rising/fading topics).
 *
 * Empty state: requires ≥ 2 concluded rounds to show meaningful
 * trends. Single-round users see a "come back next round" message.
 */
export default function TrendsView() {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/survey-rounds/trends", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load trends");
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.rounds || [];
        setRounds(list);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
        Loading…
      </p>
    );
  }
  if (error) {
    return <p className="text-center py-10 text-red-500">{error}</p>;
  }

  const concluded = rounds
    .filter((r) => r.status === "concluded")
    .sort((a, b) => a.round_number - b.round_number);

  if (concluded.length < 2) {
    return (
      <div className="space-y-3.5">
        <Header rounds={concluded} />
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
              Trends need at least 2 concluded rounds
            </div>
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {concluded.length === 0
                ? "Once you've concluded a round, the next one will compare round-over-round."
                : "Conclude one more round to see what's getting better and what's getting worse."}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const latest = concluded[concluded.length - 1];
  const prev = concluded[concluded.length - 2];
  const baseline = concluded[0];

  const handleExport = () => exportTrendsPdf({ concluded, latest, prev, baseline });

  return (
    <div className="space-y-3.5" data-testid="trends">
      <Header rounds={concluded} onExport={handleExport} />
      <HeadlineStory rounds={concluded} latest={latest} prev={prev} baseline={baseline} />
      <NpsOverTimeCard rounds={concluded} latest={latest} prev={prev} baseline={baseline} />
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <CohortMovementCard rounds={concluded} latest={latest} prev={prev} />
        <ResponseRateCard rounds={concluded} latest={latest} prev={prev} />
      </div>
      <RevenueAtRiskOverTimeCard rounds={concluded} />
      <TrendingTopicsCard latest={latest} prev={prev} />
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <BiggestMoversCard
          title="↑ Communities improving most"
          color="var(--pulse-deep)"
          movers={biggestMovers(latest, prev, "asc")}
          tooltip={
            <>
              Communities whose NPS rose the most between the previous and latest concluded round.
              The arrow shows previous → current NPS values; the pill is the delta (current minus
              previous). For example, −80 → +80 = +160. Look here for what&apos;s working — these
              are your case studies and reference accounts.
            </>
          }
        />
        <BiggestMoversCard
          title="↓ Communities declining most"
          color="var(--coral)"
          movers={biggestMovers(latest, prev, "desc")}
          tooltipAlign="right"
          tooltip={
            <>
              Communities whose NPS dropped the most between the previous and latest concluded
              round. Same delta math as the improving list, but inverted. Look here first — these
              are where you&apos;re losing trust and the next escalation is most likely to come
              from.
            </>
          }
        />
      </div>
      <ManagerLocationDeltasCard latest={latest} />
      <SizeCohortCard latest={latest} />
      <DualCohortsCard latest={latest} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────────

function Header({ rounds, onExport }) {
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const dateRange =
    first && last
      ? `${formatShortDate(first.launched_at)} → ${formatShortDate(last.concluded_at || last.launched_at)}`
      : "";
  return (
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
          Trends · {rounds.length} rounds
        </h1>
        <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
          {dateRange}
          {dateRange && " · "}what's getting better, what's getting worse.
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* "All filters" intentionally not surfaced — wasn't in the
            original spec and the trends data is portfolio-wide today.
            Will re-add when per-cohort filtering ships. */}
        {onExport && (
          <button onClick={onExport} className="btn-ghost" type="button">
            Export PDF
          </button>
        )}
      </div>
    </div>
  );
}

function HeadlineStory({ rounds, latest, prev, baseline }) {
  const totalDelta = (latest.nps_score ?? 0) - (baseline.nps_score ?? 0);
  const promPctNow = pctOf(latest.promoters, totalRespondents(latest));
  const promPctBase = pctOf(baseline.promoters, totalRespondents(baseline));
  const detPctNow = pctOf(latest.detractors, totalRespondents(latest));
  const detPctBase = pctOf(baseline.detractors, totalRespondents(baseline));

  // Find rising/fading themes from word freqs to enrich the copy.
  const { rising, fading } = topicDeltas(latest, prev);
  const topRising = rising[0]?.word;
  const topRising2 = rising[1]?.word;
  const topFading = fading[0]?.word;
  const topFading2 = fading[1]?.word;

  return (
    <div
      className="rounded-2xl bg-white overflow-hidden"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
    >
      <div
        className="flex items-center px-5 py-3.5 gap-3"
        style={{
          background: "linear-gradient(90deg, var(--plum-tint), transparent)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <SparkleBadge />
        <div className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
          What changed since last round
        </div>
      </div>
      <div
        className="px-6 py-6"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 19,
          lineHeight: 1.5,
          letterSpacing: "-0.005em",
          color: "var(--ink)",
        }}
        data-testid="trends-headline"
      >
        Across {rounds.length} rounds, your portfolio has moved{" "}
        <em
          style={{
            color: totalDelta > 0 ? "var(--pulse-deep)" : "var(--coral)",
            fontStyle: "normal",
            fontWeight: 600,
          }}
        >
          {totalDelta > 0 ? "+" : ""}
          {totalDelta} NPS points
        </em>
        {totalDelta >= 0 ? " — a real, sustained climb." : " — a notable decline."} Promoter share{" "}
        {promPctNow >= promPctBase ? "grew" : "fell"} from {promPctBase}% to {promPctNow}%;
        detractors {detPctNow <= detPctBase ? "fell" : "grew"} from {detPctBase}% to {detPctNow}%.
        {(topRising || topFading) &&
          " The drivers are clear: residents are increasingly using words like "}
        {topRising && <em style={{ fontStyle: "normal", fontWeight: 600 }}>"{topRising}"</em>}
        {topRising && topRising2 && " and "}
        {topRising2 && <em style={{ fontStyle: "normal", fontWeight: 600 }}>"{topRising2}"</em>}
        {topFading && " while complaints about "}
        {topFading && (
          <em style={{ color: "var(--coral)", fontStyle: "normal", fontWeight: 600 }}>
            "{topFading}"
          </em>
        )}
        {topFading && topFading2 && " and "}
        {topFading2 && (
          <em style={{ color: "var(--coral)", fontStyle: "normal", fontWeight: 600 }}>
            "{topFading2}"
          </em>
        )}
        {(topRising || topFading) && " have shifted. "}
        {totalDelta > 0
          ? "The pattern is concentrated in specific communities and managers — see the breakdowns below for the playbook to replicate."
          : "Worth digging into the breakdowns below to identify where to focus."}
      </div>
    </div>
  );
}

function NpsOverTimeCard({ rounds, latest, prev, baseline }) {
  const data = rounds.map((r) => ({
    round: `R${r.round_number}`,
    nps: r.nps_score ?? 0,
  }));
  const sinceBaseline = (latest.nps_score ?? 0) - (baseline.nps_score ?? 0);
  const sincePrev = (latest.nps_score ?? 0) - (prev.nps_score ?? 0);
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px] inline-flex items-center"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          NPS over time
          <InfoTip>
            Your portfolio's Net Promoter Score across every concluded round. NPS = % promoters
            (scored 9–10) minus % detractors (0–6). Range −100 to +100, where 0 means equal
            promoters and detractors. The shaded green band is the &quot;good&quot; zone (above 0).
            &quot;since R1&quot; shows total movement; &quot;since R2&quot; shows last round&apos;s
            change.
          </InfoTip>
        </h3>
        <div className="flex gap-4 text-[12px]">
          <span>
            <span
              className="font-mono font-bold"
              style={{
                color: sinceBaseline >= 0 ? "var(--pulse-deep)" : "var(--coral)",
              }}
            >
              {sinceBaseline > 0 ? "+" : ""}
              {sinceBaseline}
            </span>{" "}
            <span style={{ color: "var(--ink-3)" }}>since R{baseline.round_number}</span>
          </span>
          <span>
            <span
              className="font-mono font-bold"
              style={{
                color: sincePrev >= 0 ? "var(--pulse-deep)" : "var(--coral)",
              }}
            >
              {sincePrev > 0 ? "+" : ""}
              {sincePrev}
            </span>{" "}
            <span style={{ color: "var(--ink-3)" }}>since R{prev.round_number}</span>
          </span>
        </div>
      </div>
      {/* width is the chart's internal coordinate space; the SVG scales
            to fill its container via viewBox + width="100%". 720 keeps
            the labels at a readable size when the card stretches the
            full content width. */}
      <NpsLineChart data={data} width={720} height={220} />
    </Card>
  );
}

function CohortMovementCard({ rounds, latest, prev }) {
  const data = rounds.map((r) => ({
    round: `R${r.round_number}`,
    detractors: r.detractors || 0,
    passives: r.passives || 0,
    promoters: r.promoters || 0,
  }));

  const totalLatest = totalRespondents(latest);
  const totalPrev = totalRespondents(prev);
  const detDelta = pctOf(latest.detractors, totalLatest) - pctOf(prev.detractors, totalPrev);
  const passDelta = pctOf(latest.passives, totalLatest) - pctOf(prev.passives, totalPrev);
  const promDelta = pctOf(latest.promoters, totalLatest) - pctOf(prev.promoters, totalPrev);

  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px] inline-flex items-center"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Cohort movement · D / P / Pr share
          <InfoTip>
            How residents split between detractors (red, scored 0–6), passives (amber, 7–8), and
            promoters (green, 9–10) in each round. Bars are stacked to 100%, so the visual is about
            share, not headcount. The legend deltas (+pp / −pp) show how each group&apos;s share has
            shifted from the previous round.
          </InfoTip>
        </h3>
      </div>
      {/* Sized for the left column of the cohort/response 2-col grid.
            viewBox in StackedSentimentBars scales to the actual column
            width — 420 keeps bars and labels well-proportioned. */}
      <StackedSentimentBars data={data} width={420} height={220} />
      <div className="flex gap-4 text-[12px] mt-2">
        <LegendDot color="var(--coral)" label={`Detractors ${formatPct(detDelta)}`} />
        <LegendDot
          color="var(--amber)"
          label={`Passives ${Math.abs(passDelta) < 1 ? "flat" : formatPct(passDelta)}`}
        />
        <LegendDot color="var(--pulse)" label={`Promoters ${formatPct(promDelta)}`} />
      </div>
    </Card>
  );
}

function ResponseRateCard({ rounds, latest, prev }) {
  const delta = (latest.response_rate ?? 0) - (prev.response_rate ?? 0);
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px] inline-flex items-center"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Response rate
          <InfoTip align="right">
            Percentage of invited board members who completed the survey, round by round. The higher
            the response rate, the more representative your NPS — anything above 60% is strong for
            board surveys. The +/−pp pill shows the change vs the previous round.
          </InfoTip>
        </h3>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 38,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          {latest.response_rate ?? 0}%
        </span>
        <span
          className="text-[12px] font-semibold"
          style={{ color: delta >= 0 ? "var(--pulse-deep)" : "var(--coral)" }}
        >
          {delta > 0 ? "+" : ""}
          {delta}pp vs R{prev.round_number}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rounds.map((r) => (
          <div
            key={r.id}
            className="grid items-center gap-3 text-[13px]"
            style={{ gridTemplateColumns: "32px 1fr auto" }}
          >
            <span style={{ color: "var(--ink-4)", fontWeight: 600 }}>R{r.round_number}</span>
            <div
              className="rounded-full overflow-hidden"
              style={{ height: 8, backgroundColor: "var(--paper-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${r.response_rate ?? 0}%`,
                  backgroundColor: "var(--ink)",
                }}
              />
            </div>
            <span className="font-mono font-semibold" style={{ color: "var(--ink-2)" }}>
              {r.response_rate ?? 0}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * RevenueAtRiskOverTimeCard — bar chart showing what % of portfolio
 * value sits in detractor-classified communities each round. Uses the
 * existing trends endpoint's revenue_at_risk.percent_at_risk series.
 *
 * Why a bar chart (vs line): % at risk is a snapshot per round, not a
 * continuous trajectory. Bars read more naturally as "this is where
 * we stood at each closing" and the gridline at 20% gives operators
 * a quick "is this concerning" reference.
 */
function RevenueAtRiskOverTimeCard({ rounds }) {
  const points = rounds
    .map((r) => ({
      round: r.round_number,
      percent: r.revenue_at_risk?.percent_at_risk,
      hasData: r.revenue_at_risk?.total_portfolio_value > 0,
    }))
    .filter((p) => p.percent != null);

  // Don't render the card at all if no round has revenue data — keeps
  // free-tier accounts (no contract values on file) from seeing an
  // empty bar chart.
  if (points.length === 0) return null;

  return (
    <Card padding={22}>
      <div className="mb-3.5">
        <h3
          className="font-semibold text-[11px] uppercase inline-flex items-center"
          style={{ letterSpacing: "0.12em", color: "var(--ink-3)" }}
        >
          Revenue at risk over time
          <InfoTip>
            Percentage of total portfolio value (sum of contract values) that&apos;s sitting in
            communities currently classified as detractors. Plotted per concluded round so you can
            see whether your churn-risk exposure is shrinking or growing. The dashed line at 20% is
            a watch-line — sustained values above it usually mean a small number of large accounts
            are dragging the portfolio down.
          </InfoTip>
        </h3>
        <p className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
          Percentage of portfolio value in detractor-classified communities.
        </p>
      </div>
      <RevenueRiskBars data={points} height={220} />
    </Card>
  );
}

function RevenueRiskBars({ data, height = 220 }) {
  const width = 720;
  const pad = { top: 12, right: 20, bottom: 30, left: 44 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const barW = (w / data.length) * 0.55;
  const gap = w / data.length - barW;
  const watchLine = 20; // 20% dashed reference

  const yToPx = (pct) => pad.top + h - (pct / 100) * h;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height={height}
      role="img"
      aria-label="Revenue at risk over time"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      {/* Y gridlines */}
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line
            x1={pad.left}
            x2={pad.left + w}
            y1={yToPx(g)}
            y2={yToPx(g)}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray={g === 0 ? "0" : "2 3"}
          />
          <text
            x={pad.left - 8}
            y={yToPx(g) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--ink-4)"
            fontFamily="var(--font-mono)"
          >
            {g}%
          </text>
        </g>
      ))}
      {/* Watch line at 20% */}
      <line
        x1={pad.left}
        x2={pad.left + w}
        y1={yToPx(watchLine)}
        y2={yToPx(watchLine)}
        stroke="var(--ink-4)"
        strokeWidth="1"
        strokeDasharray="6 4"
      />
      {/* Bars */}
      {data.map((p, i) => {
        const cx = pad.left + i * (barW + gap) + gap / 2;
        const barH = (p.percent / 100) * h;
        const y = yToPx(p.percent);
        const fill = p.percent >= 20 ? "var(--coral)" : "var(--pulse)";
        const tint = p.percent >= 20 ? "var(--coral-tint)" : "var(--pulse-tint)";
        return (
          <g key={p.round}>
            {/* Soft tint backing — visible even when bar is short */}
            <rect x={cx} y={pad.top} width={barW} height={h} fill={tint} opacity="0.4" rx="3" />
            <rect x={cx} y={y} width={barW} height={barH} fill={fill} rx="3" />
            <text
              x={cx + barW / 2}
              y={Math.max(y - 6, pad.top + 12)}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={fill}
            >
              {p.percent}%
            </text>
            <text
              x={cx + barW / 2}
              y={pad.top + h + 18}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-3)"
              fontFamily="var(--font-mono)"
            >
              R{p.round}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendingTopicsCard({ latest, prev }) {
  const { rising, fading } = topicDeltas(latest, prev);
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px] inline-flex items-center"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Trending topics · what&apos;s rising and fading
          <InfoTip>
            Themes and keywords the AI extracted from this round&apos;s chats vs the previous round.
            &quot;Rising&quot; topics are coming up more than they used to (often a new concern);
            &quot;Fading&quot; topics are easing off (often a sign that an issue is getting
            resolved). Use these to quickly spot what the board is shifting attention toward.
          </InfoTip>
        </h3>
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <TopicColumn
          label="↑ Rising"
          color="var(--pulse-deep)"
          tint="var(--pulse-tint)"
          topics={rising.slice(0, 4)}
        />
        <TopicColumn
          label="↓ Fading"
          color="var(--coral)"
          tint="var(--coral-tint)"
          topics={fading.slice(0, 4)}
        />
      </div>
    </Card>
  );
}

function TopicColumn({ label, color, tint, topics }) {
  if (topics.length === 0) {
    return (
      <div>
        <div
          className="text-[11px] font-bold uppercase mb-3"
          style={{ letterSpacing: "0.08em", color }}
        >
          {label}
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--ink-4)" }}>
          No notable shifts this round.
        </p>
      </div>
    );
  }
  const direction = label.startsWith("↓") ? "fading" : "rising";
  return (
    <div>
      <div
        className="text-[11px] font-bold uppercase mb-3"
        style={{ letterSpacing: "0.08em", color }}
      >
        {label}
      </div>
      {topics.map((t, i) => (
        <div
          key={t.word}
          className="py-3"
          style={{
            borderBottom: i < topics.length - 1 ? "1px solid var(--line)" : "none",
          }}
        >
          {/* Top row: topic word + delta pill on the right */}
          <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
            <span
              className="font-semibold text-[13.5px] truncate"
              style={{ color: "var(--ink)" }}
              title={t.word}
            >
              {t.word}
            </span>
            <span
              className="text-[12px] font-bold rounded-full"
              style={{
                color,
                backgroundColor: tint,
                padding: "2px 8px",
              }}
            >
              {t.delta > 0 ? "+" : ""}
              {t.delta}
            </span>
          </div>
          {/* Interpretation sentence — gives the admin a one-line read on
                what this number actually means. Includes the round-over-
                round comparison + a short "what to do with this" tag. */}
          <p className="text-[12px] mt-1.5 leading-snug" style={{ color: "var(--ink-3)" }}>
            {interpretTopic(t, direction)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * One-sentence plain-English interpretation of a trending topic row.
 * Combines the round-over-round movement (current vs previous mention
 * counts) with a short "so what?" tag so admins don't have to translate
 * the +N pill themselves.
 *
 * Inputs:
 *   t = { word, count, delta }
 *     count = mentions this round
 *     delta = count - previous_round_count   (positive for rising)
 *   direction = "rising" | "fading"
 */
function interpretTopic(t, direction) {
  const prev = t.count - t.delta;
  if (direction === "rising") {
    if (prev === 0) {
      return `${t.count} mention${t.count === 1 ? "" : "s"} this round, none last round. A new theme — worth watching.`;
    }
    return `${t.count} mentions this round, up from ${prev}. Boards are paying more attention — worth understanding what's driving the increase.`;
  }
  // fading
  if (t.count === 0) {
    return `${prev} mention${prev === 1 ? "" : "s"} last round, none this round. Often a sign the issue is being addressed.`;
  }
  return `${t.count} mention${t.count === 1 ? "" : "s"} this round, down from ${prev}. Easing off but still on the radar.`;
}

function BiggestMoversCard({ title, color, movers, tooltip, tooltipAlign = "left" }) {
  return (
    <Card padding={22}>
      <h3 className="font-semibold text-[15px] mb-3.5 inline-flex items-center" style={{ color }}>
        {title}
        {tooltip && <InfoTip align={tooltipAlign}>{tooltip}</InfoTip>}
      </h3>
      {movers.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: "var(--ink-4)" }}>
          No notable movers this round.
        </p>
      ) : (
        movers.map((c, i) => (
          <div
            key={c.name}
            className="grid items-center gap-3 py-2.5 text-[13.5px]"
            style={{
              gridTemplateColumns: "24px 1fr auto auto",
              borderBottom: i < movers.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--ink-4)",
                fontWeight: 500,
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                {c.name}
              </div>
            </div>
            <span className="font-mono text-[12px]" style={{ color: "var(--ink-3)" }}>
              {formatNps(c.prev)} →{" "}
              <span className="font-bold" style={{ color: "var(--ink)" }}>
                {formatNps(c.nps)}
              </span>
            </span>
            <span
              className="text-[12px] font-bold rounded-full"
              style={{
                color,
                backgroundColor:
                  color === "var(--coral)" ? "var(--coral-tint)" : "var(--pulse-tint)",
                padding: "2px 8px",
              }}
            >
              {c.delta > 0 ? "+" : ""}
              {c.delta}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

function ManagerLocationDeltasCard({ latest }) {
  const managers = (latest.manager_performance || []).slice(0, 6);
  const locations = latest.location_performance || [];
  return (
    <Card padding={22}>
      <h3
        className="font-semibold text-[15px] mb-3.5 inline-flex items-center"
        style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
      >
        Manager &amp; location deltas
        <InfoTip>
          NPS broken down by community manager and by physical location, with each row&apos;s change
          vs the previous round. Helps you spot whether issues are concentrated in specific people
          or specific properties — versus being a portfolio-wide trend. A manager with a steep drop
          is usually worth a 1:1 conversation.
        </InfoTip>
      </h3>
      <div className="grid gap-7" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div>
          <div
            className="text-[11px] font-semibold uppercase mb-2"
            style={{ letterSpacing: "0.06em", color: "var(--ink-4)" }}
          >
            Managers
          </div>
          {managers.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--ink-4)" }}>
              No manager performance data.
            </p>
          ) : (
            managers.map((m, i) => {
              const change = m.change != null ? m.change : null;
              const positive = change != null && change > 0;
              return (
                <div
                  key={m.name || m.manager}
                  className="grid items-center gap-2.5 py-2 text-[13px]"
                  style={{
                    gridTemplateColumns: "28px 1fr 80px 60px 60px",
                    borderBottom: i < managers.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor:
                        change == null
                          ? "var(--ink-4)"
                          : positive
                            ? "var(--pulse)"
                            : "var(--coral)",
                    }}
                  >
                    {(m.name || m.manager || "??").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                    {m.name || m.manager}
                  </span>
                  {m.prev != null ? (
                    <span className="font-mono text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Prev {formatNps(m.prev)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="font-mono font-bold text-[12px]" style={{ color: "var(--ink)" }}>
                    {formatNps(m.nps)}
                  </span>
                  {change != null && (
                    <span
                      className="text-[11.5px] font-bold rounded-full"
                      style={{
                        color: positive ? "var(--pulse-deep)" : "var(--coral)",
                        backgroundColor: positive ? "var(--pulse-tint)" : "var(--coral-tint)",
                        padding: "2px 7px",
                        textAlign: "center",
                      }}
                    >
                      {positive ? "+" : ""}
                      {change}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div>
          <div
            className="text-[11px] font-semibold uppercase mb-2"
            style={{ letterSpacing: "0.06em", color: "var(--ink-4)" }}
          >
            Office locations
          </div>
          {locations.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--ink-4)" }}>
              No location data.
            </p>
          ) : (
            locations.map((l, i) => {
              // Backend writes `change` (and `prev`); accept the legacy
              // `delta` alias for older payloads cached at the edge.
              const change = l.change != null ? l.change : l.delta != null ? l.delta : null;
              const positive = change != null && change > 0;
              return (
                <div
                  key={l.location || l.name}
                  className="grid items-center gap-2.5 py-2 text-[13px]"
                  style={{
                    gridTemplateColumns: "1fr 60px 60px",
                    borderBottom: i < locations.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <span className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                    {(l.location || l.name || "").replace(" Office", "")}
                  </span>
                  <span className="font-mono text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {formatNps(l.nps)}
                  </span>
                  {change != null ? (
                    <span
                      className="text-[11.5px] font-bold rounded-full"
                      style={{
                        color: positive ? "var(--pulse-deep)" : "var(--coral)",
                        backgroundColor: positive ? "var(--pulse-tint)" : "var(--coral-tint)",
                        padding: "2px 7px",
                        textAlign: "center",
                      }}
                    >
                      {positive ? "+" : ""}
                      {change}
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Size cohort card — current-round NPS by community size, with the
// round-over-round change pill so cohorts that are slipping pop. Data
// comes from the trends endpoint's size_performance array (already
// computed; backend post-pass attaches prev/change by cohort name).
// ──────────────────────────────────────────────────────────────────────

function SizeCohortCard({ latest }) {
  const sizes = latest.size_performance || [];
  if (sizes.length === 0) return null;
  return (
    <Card padding={22}>
      <div className="flex items-baseline justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px] inline-flex items-center"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          By community size
          <InfoTip>
            NPS grouped by community size (small / medium / large, auto-bucketed by unit count).
            Reveals whether your service quality holds up across scales — a much lower NPS in large
            communities, for example, often means staffing ratios need attention.
          </InfoTip>
        </h3>
        <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
          Cohorts auto-bucket by unit count.
        </span>
      </div>
      <div className="flex flex-col">
        {sizes.map((s, i) => {
          const change = s.change != null ? s.change : null;
          const positive = change != null && change > 0;
          return (
            <div
              key={s.name}
              className="grid items-center gap-3 py-2 text-[13px]"
              style={{
                gridTemplateColumns: "1.4fr 80px 60px 80px 60px",
                borderBottom: i < sizes.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <span className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                {s.name}
              </span>
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                {s.communities || 0} communities
              </span>
              <span
                className="text-[11.5px]"
                style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
              >
                {s.respondents || 0} resp
              </span>
              <span
                className="font-mono font-bold text-[12px]"
                style={{ color: "var(--ink)", textAlign: "right" }}
              >
                {formatNps(s.nps)}
              </span>
              {change != null ? (
                <span
                  className="text-[11.5px] font-bold rounded-full"
                  style={{
                    color: positive ? "var(--pulse-deep)" : "var(--coral)",
                    backgroundColor: positive ? "var(--pulse-tint)" : "var(--coral-tint)",
                    padding: "2px 7px",
                    textAlign: "center",
                  }}
                >
                  {positive ? "+" : ""}
                  {change}
                </span>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Dual cohorts — communities that have been in the same extreme cohort
// for ≥2 consecutive rounds ending with the latest. Detractors are the
// silent-churn list (sorted by ARR-at-risk); promoters are the
// case-study / reference list (sorted by NPS strength).
//
// Aesthetic per Mike: matches the rest of v2 — soft cards, pulse/coral
// tints, Fraunces head, mono numbers, hairline row dividers. No rough
// design-system chips.
// ──────────────────────────────────────────────────────────────────────

function DualCohortsCard({ latest }) {
  const detractors = latest.dual_detractors || [];
  const promoters = latest.dual_promoters || [];
  if (detractors.length === 0 && promoters.length === 0) return null;
  // Stacked vertically (was side-by-side) so each row has full-width
  // breathing room — community + manager + per-round chips + ARR + NPS
  // + trend pill is too much content for half the viewport.
  return (
    <div className="flex flex-col gap-3.5">
      <DualCohortPanel
        title="Dual detractors"
        sub="Two or more rounds in the detractor cohort — silent-churn watch list."
        tone="risk"
        rows={detractors}
        emptyHint="No communities have stayed in the detractor cohort across rounds."
        tooltip={
          <>
            Communities that have scored as detractors (NPS 0–6) in two or more consecutive rounds —
            including the latest. These are your highest churn-risk accounts: the problem isn&apos;t
            a one-off, it&apos;s persistent. Sorted by ARR-at-risk so the biggest dollar exposure
            surfaces first.
          </>
        }
      />
      <DualCohortPanel
        title="Dual promoters"
        sub="Two or more rounds in the promoter cohort — case studies + reference list."
        tone="good"
        rows={promoters}
        emptyHint="No communities have stayed in the promoter cohort across rounds."
        tooltip={
          <>
            Communities that have scored as promoters (NPS 9–10) in two or more consecutive rounds.
            Stable promoters make the best case studies, references, and testimonial sources — and
            their managers are usually doing something worth replicating elsewhere.
          </>
        }
      />
    </div>
  );
}

function DualCohortPanel({ title, sub, tone, rows, emptyHint, tooltip }) {
  const accent = tone === "risk" ? "var(--coral)" : "var(--pulse-deep)";
  const tint = tone === "risk" ? "var(--coral-tint)" : "var(--pulse-tint)";
  return (
    <Card padding={22}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="rounded-md flex items-center justify-center"
              style={{ width: 22, height: 22, backgroundColor: tint, color: accent }}
            >
              {tone === "risk" ? <RiskGlyph /> : <PromoterGlyph />}
            </span>
            <h3
              className="font-semibold text-[15px] inline-flex items-center"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              {title}
              {tooltip && <InfoTip>{tooltip}</InfoTip>}
            </h3>
            <span
              className="text-[11.5px] font-bold rounded-full"
              style={{
                color: accent,
                backgroundColor: tint,
                padding: "2px 8px",
              }}
            >
              {rows.length}
            </span>
          </div>
          <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            {sub}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p
          className="text-[12.5px] mt-3 py-3 text-center"
          style={{ color: "var(--ink-4)", borderTop: "1px solid var(--line)" }}
        >
          {emptyHint}
        </p>
      ) : (
        <div className="flex flex-col mt-3">
          {rows.slice(0, 8).map((r, i) => (
            <DualCohortRow
              key={r.name}
              row={r}
              tone={tone}
              isLast={i === Math.min(rows.length, 8) - 1}
            />
          ))}
          {rows.length > 8 && (
            <div
              className="text-[11.5px] text-center pt-3 mt-1"
              style={{ color: "var(--ink-4)", borderTop: "1px solid var(--line)" }}
            >
              + {rows.length - 8} more
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DualCohortRow({ row, tone, isLast }) {
  const accent = tone === "risk" ? "var(--coral)" : "var(--pulse-deep)";
  const tint = tone === "risk" ? "var(--coral-tint)" : "var(--pulse-tint)";
  const arr = Number(row.contract_value) || 0;
  // Trend pill: "Improving" / "Declining" / "Stable" — for detractors
  // 'improving' is good (less-bad), for promoters 'declining' is the
  // worry. Color follows that intuition.
  const trendLabel =
    row.trend === "improving" ? "Improving" : row.trend === "declining" ? "Declining" : "Stable";
  const trendIsGood =
    (tone === "risk" && row.trend === "improving") ||
    (tone === "good" && row.trend === "improving");
  const trendIsBad =
    (tone === "risk" && row.trend === "declining") ||
    (tone === "good" && row.trend === "declining");
  const trendColor = trendIsGood
    ? "var(--pulse-deep)"
    : trendIsBad
      ? "var(--coral)"
      : "var(--ink-4)";
  const trendBg = trendIsGood
    ? "var(--pulse-tint)"
    : trendIsBad
      ? "var(--coral-tint)"
      : "var(--paper-2)";

  return (
    <div
      className="grid items-center gap-3 py-2.5 text-[13px]"
      style={{
        gridTemplateColumns: "1.6fr auto 1fr 70px 90px",
        borderBottom: isLast ? "none" : "1px solid var(--line)",
      }}
    >
      <div className="min-w-0">
        <div className="font-semibold truncate" style={{ color: "var(--ink)" }}>
          {row.name}
        </div>
        <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
          {row.community_manager_name || "Unassigned"} · {row.consecutive_rounds} rounds in cohort
        </div>
      </div>
      <RoundChips history={row.history} accent={accent} tint={tint} />
      <span
        className="text-[11.5px]"
        style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
      >
        {arr > 0 ? `${formatTrendsMoney(arr)} ARR` : "—"}
      </span>
      <span
        className="font-mono font-bold text-[12px]"
        style={{ color: accent, textAlign: "right" }}
      >
        {formatNps(row.latest_nps)}
      </span>
      <span
        className="text-[10.5px] font-bold rounded-full"
        style={{
          color: trendColor,
          backgroundColor: trendBg,
          padding: "3px 8px",
          letterSpacing: "0.04em",
          textAlign: "center",
          textTransform: "uppercase",
        }}
      >
        {trendLabel}
      </span>
    </div>
  );
}

function RoundChips({ history, accent, tint }) {
  if (!history || history.length === 0) return <span />;
  return (
    <div className="flex items-center gap-1">
      {history.map((h, i) => (
        <span
          key={i}
          className="font-mono font-semibold rounded"
          style={{
            fontSize: 10.5,
            padding: "3px 6px",
            backgroundColor: tint,
            color: accent,
            minWidth: 36,
            textAlign: "center",
          }}
          title={`Round ${h.round_number} · NPS ${h.nps != null ? h.nps : "—"}`}
        >
          {h.nps != null ? formatNps(h.nps) : "—"}
        </span>
      ))}
    </div>
  );
}

function RiskGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PromoterGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 9V5a3 3 0 0 0-6 0v4M5 9h14l-1 11H6L5 9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTrendsMoney(n) {
  const num = Number(n);
  if (!num || num <= 0) return "";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`;
  if (num >= 10_000) return `$${Math.round(num / 1000)}K`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

// ──────────────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────────────

function Card({ children, padding = 22 }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)", padding }}
    >
      {children}
    </div>
  );
}

function SparkleBadge() {
  return (
    <div
      className="rounded-md flex items-center justify-center"
      style={{ width: 26, height: 26, backgroundColor: "var(--plum)", color: "white" }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
      </svg>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-sm" style={{ width: 10, height: 10, backgroundColor: color }} />
      {label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function totalRespondents(round) {
  return (round.promoters || 0) + (round.passives || 0) + (round.detractors || 0);
}

function pctOf(n, total) {
  if (!total) return 0;
  return Math.round(((n || 0) / total) * 100);
}

function formatPct(n) {
  if (n === 0) return "flat";
  return `${n > 0 ? "+" : ""}${n}pp`;
}

function formatNps(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatShortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Diff word_frequencies between latest and prev rounds. Returns the
 * top rising and top fading words with mention counts and delta.
 *
 * Word freqs may be a string (JSON) or array of {word, count} or
 * {term, count} — the parser tolerates both shapes since the data
 * layer wasn't always consistent.
 */
function topicDeltas(latest, prev) {
  const latestMap = freqsToMap(latest.word_frequencies);
  const prevMap = freqsToMap(prev.word_frequencies);
  const allWords = new Set([...latestMap.keys(), ...prevMap.keys()]);

  const items = [];
  for (const w of allWords) {
    const now = latestMap.get(w) || 0;
    const before = prevMap.get(w) || 0;
    items.push({ word: w, count: now, delta: now - before });
  }
  // Filter trivial words and tiny counts.
  const filtered = items.filter(
    (i) => i.word.length >= 4 && (i.count >= 3 || Math.abs(i.delta) >= 3)
  );
  const rising = filtered.filter((i) => i.delta > 0).sort((a, b) => b.delta - a.delta);
  const fading = filtered.filter((i) => i.delta < 0).sort((a, b) => a.delta - b.delta);
  return { rising, fading };
}

function freqsToMap(freqs) {
  const m = new Map();
  if (!freqs) return m;
  let parsed = freqs;
  if (typeof freqs === "string") {
    try {
      parsed = JSON.parse(freqs);
    } catch {
      return m;
    }
  }
  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === "object") {
      // {word: count} shape
      for (const [w, c] of Object.entries(parsed)) {
        m.set(w.toLowerCase(), Number(c) || 0);
      }
    }
    return m;
  }
  for (const item of parsed) {
    const word = (item.word || item.term || item.text || "").toLowerCase();
    const count = Number(item.count || item.frequency || item.n || 0);
    if (word) m.set(word, (m.get(word) || 0) + count);
  }
  return m;
}

/**
 * Biggest community movers between latest and prev rounds.
 * `direction` 'asc' returns improvers (rising NPS), 'desc' returns
 * decliners (falling NPS). Top 4 by absolute delta.
 */
function biggestMovers(latest, prev, direction) {
  const prevByName = new Map();
  for (const c of prev.community_details || []) {
    prevByName.set(c.name, c);
  }
  const items = [];
  for (const c of latest.community_details || []) {
    const p = prevByName.get(c.name);
    if (!p) continue;
    const npsNow = medianToNps(c.median);
    const npsPrev = medianToNps(p.median);
    if (npsNow == null || npsPrev == null) continue;
    items.push({
      name: c.name,
      nps: npsNow,
      prev: npsPrev,
      delta: npsNow - npsPrev,
    });
  }
  if (direction === "asc") {
    return items.sort((a, b) => b.delta - a.delta).slice(0, 4);
  }
  return items.sort((a, b) => a.delta - b.delta).slice(0, 4);
}

function medianToNps(median) {
  if (median == null) return null;
  return Math.round((median - 5) * 20);
}

// ──────────────────────────────────────────────────────────────────────
// PDF export
// ──────────────────────────────────────────────────────────────────────

/**
 * exportTrendsPdf — opens a new window with a printable v2-styled
 * report covering the same sections as the Trends page on screen:
 * NPS over time, cohort movement, response rate, revenue at risk,
 * trending topics, biggest movers, manager + location deltas.
 *
 * Uses utils/pdfReport for shared chrome (palette, type, brand bar,
 * footer) and the SVG generators so what prints matches what's on
 * screen. The chart components themselves stay React-rendered for
 * the in-app view; the printable uses static-string mirrors.
 */
function exportTrendsPdf({ concluded, latest, prev, baseline }) {
  const totalDelta = (latest.nps_score ?? 0) - (baseline.nps_score ?? 0);
  const totalDeltaSign = totalDelta > 0 ? "+" : "";

  // ── NPS over time ───────────────────────────────────────────────
  const npsLineData = concluded.map((r) => ({
    round: `R${r.round_number}`,
    nps: r.nps_score ?? 0,
  }));

  // ── Cohort movement ────────────────────────────────────────────
  const cohortData = concluded.map((r) => ({
    round: r.round_number,
    detractors: r.detractors || 0,
    passives: r.passives || 0,
    promoters: r.promoters || 0,
  }));

  // ── Response rate ──────────────────────────────────────────────
  const respRateData = concluded.map((r) => ({
    label: `R${r.round_number}`,
    value: r.response_rate || 0,
    max: 100,
    suffix: "%",
  }));

  // ── Revenue at risk ────────────────────────────────────────────
  const revenuePoints = concluded
    .map((r) => ({
      round: r.round_number,
      percent: r.revenue_at_risk?.percent_at_risk,
    }))
    .filter((p) => p.percent != null);

  // ── Topics ──────────────────────────────────────────────────────
  const { rising, fading } = topicDeltas(latest, prev);

  // ── Movers ──────────────────────────────────────────────────────
  const improvers = biggestMovers(latest, prev, "asc");
  const decliners = biggestMovers(latest, prev, "desc");

  // ── Manager + Location ──────────────────────────────────────────
  const managers = (latest.manager_performance || []).slice(0, 10);
  const locations = (latest.location_performance || []).slice(0, 10);

  const dateRange =
    concluded[0] && concluded[concluded.length - 1]
      ? `${formatShort(concluded[0].launched_at)} → ${formatShort(
          concluded[concluded.length - 1].concluded_at ||
            concluded[concluded.length - 1].launched_at
        )}`
      : "";

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>Trends report</title>
<style>${baseStyles()}</style>
</head><body>
${toolbar()}
${brandBar({
  logoUrl: "/api/admin/account/logo",
  eyebrow: "Trends report",
  title: `${concluded.length} concluded rounds`,
  subtitle: dateRange,
})}

<div class="card ink">
  <div class="uppercase-eyebrow" style="color:${PdfC.pulse};">Headline</div>
  <h1 style="font-size:22px;color:white;margin-top:4px;">
    NPS moved <span class="num">${escapeHtml(totalDeltaSign + totalDelta)}</span>
    from R${baseline.round_number} (${formatNps(baseline.nps_score)}) to
    R${latest.round_number} (${formatNps(latest.nps_score)}).
  </h1>
  <p style="margin-top:8px;">
    Promoter share went from
    <strong>${pctOf(baseline.promoters, totalRespondents(baseline))}%</strong> to
    <strong>${pctOf(latest.promoters, totalRespondents(latest))}%</strong>;
    detractor share from
    <strong>${pctOf(baseline.detractors, totalRespondents(baseline))}%</strong> to
    <strong>${pctOf(latest.detractors, totalRespondents(latest))}%</strong>.
  </p>
</div>

<h2>NPS over time</h2>
<div class="card">${npsLineSvg(npsLineData)}</div>

<h2>Cohort movement</h2>
<div class="card">
  <p class="micro" style="margin-bottom:8px;">
    Detractor (coral) / Passive (amber) / Promoter (pulse) share, normalized to 100% per round.
  </p>
  ${stackedSentimentSvg(cohortData)}
</div>

<h2>Response rate</h2>
<div class="card">
  <p class="micro" style="margin-bottom:8px;">% of invited board members who completed the survey.</p>
  ${horizontalBarsSvg(respRateData)}
</div>

${
  revenuePoints.length > 0
    ? `
<h2>Revenue at risk over time</h2>
<div class="card">
  <p class="micro" style="margin-bottom:8px;">
    % of total portfolio value sitting in detractor-classified communities. Dashed line at 20% is the watch threshold.
  </p>
  ${revenueRiskSvg(revenuePoints)}
</div>`
    : ""
}

${
  rising.length > 0 || fading.length > 0
    ? `
<h2>Trending topics</h2>
<div class="row">
  <div class="card">
    <div class="uppercase-eyebrow" style="color:${PdfC.pulseDeep};">↑ Rising</div>
    ${
      rising.length === 0
        ? '<p class="muted">No notable rising topics.</p>'
        : `<ul style="margin:6px 0;padding-left:18px;">${rising
            .slice(0, 6)
            .map(
              (t) =>
                `<li><strong>${escapeHtml(t.word)}</strong> <span class="muted">(${t.delta > 0 ? "+" : ""}${t.delta} mentions)</span></li>`
            )
            .join("")}</ul>`
    }
  </div>
  <div class="card">
    <div class="uppercase-eyebrow" style="color:${PdfC.coral};">↓ Fading</div>
    ${
      fading.length === 0
        ? '<p class="muted">No notable fading topics.</p>'
        : `<ul style="margin:6px 0;padding-left:18px;">${fading
            .slice(0, 6)
            .map(
              (t) =>
                `<li><strong>${escapeHtml(t.word)}</strong> <span class="muted">(${t.delta} mentions)</span></li>`
            )
            .join("")}</ul>`
    }
  </div>
</div>`
    : ""
}

<h2>Communities improving most</h2>
${
  improvers.length === 0
    ? '<p class="muted">No notable improvers this round.</p>'
    : renderTable(
        [
          { label: "Community", key: "name" },
          {
            label: "Prev → Now",
            key: "shift",
            align: "right",
            render: (_, r) =>
              `<span class="num" style="color:${PdfC.ink3};">${formatNps(r.prev)}</span> → <span class="num" style="color:${PdfC.ink};">${formatNps(r.nps)}</span>`,
          },
          {
            label: "Delta",
            key: "delta",
            align: "right",
            render: (v) =>
              `<span class="num" style="color:${PdfC.pulseDeep};">${v > 0 ? "+" : ""}${v}</span>`,
          },
        ],
        improvers
      )
}

<h2>Communities declining most</h2>
${
  decliners.length === 0
    ? '<p class="muted">No notable decliners this round.</p>'
    : renderTable(
        [
          { label: "Community", key: "name" },
          {
            label: "Prev → Now",
            key: "shift",
            align: "right",
            render: (_, r) =>
              `<span class="num" style="color:${PdfC.ink3};">${formatNps(r.prev)}</span> → <span class="num" style="color:${PdfC.ink};">${formatNps(r.nps)}</span>`,
          },
          {
            label: "Delta",
            key: "delta",
            align: "right",
            render: (v) =>
              `<span class="num" style="color:${PdfC.coral};">${v > 0 ? "+" : ""}${v}</span>`,
          },
        ],
        decliners
      )
}

${
  managers.length > 0
    ? `
<h2>Manager performance</h2>
${renderTable(
  [
    { label: "Manager", key: "name", render: (_, r) => r.name || r.manager || "—" },
    { label: "Communities", key: "communities", align: "center" },
    { label: "Respondents", key: "respondents", align: "center" },
    {
      label: "NPS",
      key: "nps",
      align: "right",
      render: (v, r) => {
        const change =
          r.change != null
            ? ` <span class="muted">(${r.change > 0 ? "+" : ""}${r.change})</span>`
            : "";
        return `<span class="num" style="color:${npsHex(v)};">${formatNps(v)}</span>${change}`;
      },
    },
  ],
  managers
)}`
    : ""
}

${
  locations.length > 0
    ? `
<h2>By location</h2>
${renderTable(
  [
    { label: "Location", key: "location" },
    { label: "Respondents", key: "respondents", align: "center" },
    {
      label: "NPS",
      key: "nps",
      align: "right",
      render: (v, r) => {
        const change =
          r.change != null
            ? ` <span class="muted">(${r.change > 0 ? "+" : ""}${r.change})</span>`
            : "";
        return `<span class="num" style="color:${npsHex(v)};">${formatNps(v)}</span>${change}`;
      },
    },
  ],
  locations
)}`
    : ""
}

${footer()}
</body></html>`;

  openReportWindow(html, { title: "Trends report" });
}
