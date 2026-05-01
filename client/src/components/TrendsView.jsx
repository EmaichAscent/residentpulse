import { useState, useEffect } from "react";
import { NpsLineChart, StackedSentimentBars } from "./charts/NpsCharts";

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

  return (
    <div className="space-y-3.5" data-testid="trends">
      <Header rounds={concluded} />
      <HeadlineStory rounds={concluded} latest={latest} prev={prev} baseline={baseline} />
      <NpsOverTimeCard rounds={concluded} latest={latest} prev={prev} baseline={baseline} />
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <CohortMovementCard rounds={concluded} latest={latest} prev={prev} />
        <ResponseRateCard rounds={concluded} latest={latest} prev={prev} />
      </div>
      <TrendingTopicsCard latest={latest} prev={prev} />
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <BiggestMoversCard
          title="↑ Communities improving most"
          color="var(--pulse-deep)"
          movers={biggestMovers(latest, prev, "asc")}
        />
        <BiggestMoversCard
          title="↓ Communities declining most"
          color="var(--coral)"
          movers={biggestMovers(latest, prev, "desc")}
        />
      </div>
      <ManagerLocationDeltasCard latest={latest} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────────────────

function Header({ rounds }) {
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
        <button
          onClick={() =>
            alert("Filters coming soon — for now the page shows all communities across all rounds.")
          }
          className="btn-ghost"
          type="button"
        >
          All filters
        </button>
        <button
          onClick={() => alert("Trends export coming soon.")}
          className="btn-ghost"
          type="button"
        >
          Export
        </button>
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
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          NPS over time
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
      <NpsLineChart data={data} width={1100} height={220} />
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
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Cohort movement · D / P / Pr share
        </h3>
      </div>
      <StackedSentimentBars data={data} width={620} height={220} />
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
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Response rate
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

function TrendingTopicsCard({ latest, prev }) {
  const { rising, fading } = topicDeltas(latest, prev);
  return (
    <Card padding={22}>
      <div className="flex items-center justify-between mb-3.5">
        <h3
          className="font-semibold text-[15px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
        >
          Trending topics · what's rising and fading
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
          className="grid items-center gap-3 py-2 text-[13.5px]"
          style={{
            gridTemplateColumns: "120px 1fr auto",
            borderBottom: i < topics.length - 1 ? "1px solid var(--line)" : "none",
          }}
        >
          <span className="font-semibold truncate" style={{ color: "var(--ink)" }} title={t.word}>
            {t.word}
          </span>
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            {t.count} mention{t.count === 1 ? "" : "s"} this round
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
      ))}
    </div>
  );
}

function BiggestMoversCard({ title, color, movers }) {
  return (
    <Card padding={22}>
      <h3 className="font-semibold text-[15px] mb-3.5" style={{ color }}>
        {title}
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
        className="font-semibold text-[15px] mb-3.5"
        style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
      >
        Manager &amp; location deltas
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
              const delta = l.delta != null ? l.delta : null;
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
                  {delta != null ? (
                    <span
                      className="text-[11.5px] font-bold rounded-full"
                      style={{
                        color: delta > 0 ? "var(--pulse-deep)" : "var(--coral)",
                        backgroundColor: delta > 0 ? "var(--pulse-tint)" : "var(--coral-tint)",
                        padding: "2px 7px",
                        textAlign: "center",
                      }}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta}
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
