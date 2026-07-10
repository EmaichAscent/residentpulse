import { useState, useEffect } from "react";

/**
 * Survey data (Zoho parity Phase E1) — structured-answer dashboards
 * over survey_answers. Two views:
 *
 *   Questions — per-question trend across rounds: average (1–5 or
 *     0–10), answered/skipped counts, and Zoho-era delta labels for
 *     imported history. Deltas for native rounds are what the reader
 *     sees between consecutive averages — never stored.
 *
 *   People — per-manager / per-bookkeeper rollups ("Debbie's book
 *     averages 4.2"), the stat Zoho couldn't produce.
 *
 * Read-only; works identically for viewer-tier logins.
 */

const CATEGORY_ORDER = [
  "NPS",
  "Company service",
  "Community management",
  "Manager",
  "Financials",
  "Churn signal",
  "Open feedback",
];

export default function SurveyData() {
  const [questions, setQuestions] = useState(null);
  const [managers, setManagers] = useState(null);
  const [bookkeepers, setBookkeepers] = useState(null);
  const [view, setView] = useState("questions");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [q, m, b] = await Promise.all([
          fetch("/api/admin/survey-analytics/questions", { credentials: "include" }).then((r) =>
            r.json()
          ),
          fetch("/api/admin/survey-analytics/people?type=managers", {
            credentials: "include",
          }).then((r) => r.json()),
          fetch("/api/admin/survey-analytics/people?type=bookkeepers", {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        setQuestions(Array.isArray(q) ? q : []);
        setManagers(Array.isArray(m) ? m : []);
        setBookkeepers(Array.isArray(b) ? b : []);
      } catch {
        setError("Couldn't load survey data. Refresh to retry.");
      }
    })();
  }, []);

  if (error) {
    return (
      <div role="alert" style={{ color: "var(--ink-3)", fontSize: 14 }}>
        {error}
      </div>
    );
  }
  if (!questions) {
    return <div style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading survey data…</div>;
  }

  const categories = [...new Set(questions.map((q) => q.category || "Other"))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) + 99 - (CATEGORY_ORDER.indexOf(b) + 99)
  );

  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 650,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Survey data
        </h1>
        <div
          className="inline-flex"
          style={{
            background: "var(--paper-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 3,
            gap: 3,
          }}
          role="tablist"
        >
          {[
            ["questions", "Questions"],
            ["people", "People"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                background: view === key ? "white" : "transparent",
                color: view === key ? "var(--ink)" : "var(--ink-3)",
                boxShadow: view === key ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 0 20px", maxWidth: 640 }}>
        Every structured rating collected by your surveys — averages per round, skip rates, and
        per-person rollups. Ratings are stored as absolutes, so any question can show its trend.
      </p>

      {questions.length === 0 && (
        <div
          style={{
            background: "white",
            border: "1px dashed var(--line)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 14,
          }}
        >
          No structured answers yet. They'll appear here as survey rounds collect widget ratings —
          or after a historical import.
        </div>
      )}

      {view === "questions" &&
        categories.map((cat) => {
          const inCat = questions.filter((q) => (q.category || "Other") === cat);
          if (!inCat.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 26 }}>
              <h3
                className="font-bold uppercase"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.09em",
                  color: "var(--ink-3)",
                  margin: "0 0 8px",
                }}
              >
                {cat}
              </h3>
              {inCat.map((q) => (
                <QuestionRow key={q.question_id} q={q} />
              ))}
            </div>
          );
        })}

      {view === "people" && (
        <>
          <PeopleTable title="Managers" people={managers || []} />
          <PeopleTable title="Bookkeepers" people={bookkeepers || []} />
        </>
      )}
    </div>
  );
}

function trendArrow(rounds) {
  const rated = rounds.filter((r) => r.avg != null);
  if (rated.length < 2) return null;
  const prev = rated[rated.length - 2].avg;
  const last = rated[rated.length - 1].avg;
  const diff = Math.round((last - prev) * 100) / 100;
  if (Math.abs(diff) < 0.05) return { glyph: "→", color: "var(--ink-3)", diff: 0 };
  return diff > 0
    ? { glyph: "▲", color: "var(--pulse-deep)", diff }
    : { glyph: "▼", color: "#B3362B", diff };
}

function QuestionRow({ q }) {
  const scaleMax = q.answer_format === "nps" ? 10 : 5;
  const trend = trendArrow(q.rounds);
  const latest = [...q.rounds].reverse().find((r) => r.avg != null);
  const totalSkipped = q.rounds.reduce((s, r) => s + r.skipped, 0);
  const totalAnswered = q.rounds.reduce((s, r) => s + r.answered, 0);
  const hasDeltaHistory = q.rounds.some((r) => Object.keys(r.delta_counts).length > 0);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 6,
        display: "grid",
        gridTemplateColumns: "minmax(200px, 1.4fr) 1fr auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          {q.label}{" "}
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "monospace" }}>
            {q.code}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
          {totalAnswered} answered
          {totalSkipped > 0 && ` · ${totalSkipped} skipped`}
          {hasDeltaHistory && " · includes Zoho-era delta ratings"}
        </div>
      </div>

      {/* Per-round mini bars (absolute averages only) */}
      <div className="flex items-end" style={{ gap: 4, height: 34 }} aria-hidden="true">
        {q.rounds.map((r, i) =>
          r.avg != null ? (
            <div
              key={i}
              title={`Round ${r.round_number ?? "—"}: ${r.avg}/${scaleMax}`}
              style={{
                width: 16,
                height: `${Math.max(8, (r.avg / scaleMax) * 34)}px`,
                background: "var(--pulse)",
                opacity: 0.35 + 0.65 * ((i + 1) / q.rounds.length),
                borderRadius: 3,
              }}
            />
          ) : (
            <div
              key={i}
              title={`Round ${r.round_number ?? "—"}: delta-era data`}
              style={{
                width: 16,
                height: 8,
                background: "var(--line)",
                borderRadius: 3,
              }}
            />
          )
        )}
      </div>

      <div style={{ textAlign: "right", minWidth: 86 }}>
        {latest ? (
          <>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{latest.avg}</span>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}> / {scaleMax}</span>
            {trend && (
              <span style={{ fontSize: 12, fontWeight: 700, color: trend.color, marginLeft: 6 }}>
                {trend.glyph}
                {trend.diff !== 0 && Math.abs(trend.diff)}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
            delta-era only
          </span>
        )}
      </div>
    </div>
  );
}

function PeopleTable({ title, people }) {
  const rated = people.filter((p) => p.rated_answers > 0);
  return (
    <div style={{ marginBottom: 28 }}>
      <h3
        className="font-bold uppercase"
        style={{ fontSize: 11, letterSpacing: "0.09em", color: "var(--ink-3)", margin: "0 0 8px" }}
      >
        {title}
      </h3>
      {rated.length === 0 && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontStyle: "italic" }}>
          No rated answers yet for {title.toLowerCase()}.
        </div>
      )}
      {rated.map((p) => {
        const trend = trendArrow(p.rounds);
        return (
          <div
            key={p.id}
            style={{
              background: "white",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 6,
              display: "grid",
              gridTemplateColumns: "minmax(160px, 1.3fr) 1fr auto",
              gap: 16,
              alignItems: "center",
              opacity: p.status === "inactive" ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                {p.name}
                {p.status === "inactive" && (
                  <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>
                    (inactive)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                {p.community_count} active communit{p.community_count === 1 ? "y" : "ies"} ·{" "}
                {p.rated_answers} rated answers
              </div>
            </div>

            <div className="flex items-end" style={{ gap: 4, height: 34 }} aria-hidden="true">
              {p.rounds.map((r, i) =>
                r.avg != null ? (
                  <div
                    key={i}
                    title={`Round ${r.round_number ?? "—"}: ${r.avg}/5 (${r.rated} ratings)`}
                    style={{
                      width: 16,
                      height: `${Math.max(8, (r.avg / 5) * 34)}px`,
                      background: "var(--pulse)",
                      opacity: 0.35 + 0.65 * ((i + 1) / p.rounds.length),
                      borderRadius: 3,
                    }}
                  />
                ) : null
              )}
            </div>

            <div style={{ textAlign: "right", minWidth: 86 }}>
              {p.overall_avg != null && (
                <>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                    {p.overall_avg}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}> / 5</span>
                  {trend && (
                    <span
                      style={{ fontSize: 12, fontWeight: 700, color: trend.color, marginLeft: 6 }}
                    >
                      {trend.glyph}
                      {trend.diff !== 0 && Math.abs(trend.diff)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
