import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, LabelList,
} from "recharts";
import { COLORS } from "../utils/npsHelpers";

/* Custom dot that colors by NPS value */
function NpsDot({ cx, cy, payload }) {
  const color = payload.nps >= 0 ? COLORS.promoter : COLORS.detractor;
  return (
    <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />
  );
}

/* Custom label showing NPS value above/below each dot */
function NpsLabel({ x, y, value }) {
  const formatted = value > 0 ? `+${value}` : `${value}`;
  const above = value >= 0;
  return (
    <text
      x={x} y={above ? y - 14 : y + 20}
      textAnchor="middle" fontSize={13} fontWeight={600}
      fill={value >= 0 ? COLORS.promoter : COLORS.detractor}
    >
      {formatted}
    </text>
  );
}

export default function TrendsView() {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrends();
  }, []);

  const loadTrends = async () => {
    try {
      const res = await fetch("/api/admin/survey-rounds/trends", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (err) {
      console.error("Failed to load trends:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading trends...</p>;
  }

  const concludedRounds = trends.filter((t) => t.status === "concluded");

  if (concludedRounds.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Not enough data yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Trends become available after completing at least 2 survey rounds.
          {concludedRounds.length === 1
            ? " You have 1 completed round — complete one more to see trends."
            : " Complete your first survey rounds to start tracking trends."}
        </p>
      </div>
    );
  }

  // Prepare chart data
  const npsData = concludedRounds.map((r) => ({
    name: `R${r.round_number}`,
    nps: r.nps_score,
    round_number: r.round_number,
  }));

  // Dynamic Y-axis: pad 20 above/below the data range, snap to multiples of 10
  const npsValues = npsData.map((d) => d.nps);
  const npsMin = Math.floor((Math.min(...npsValues) - 20) / 10) * 10;
  const npsMax = Math.ceil((Math.max(...npsValues) + 20) / 10) * 10;

  const responseData = concludedRounds.map((r) => ({
    name: `R${r.round_number}`,
    rate: r.response_rate,
    count: r.response_count,
    invited: r.invited_count,
  }));

  // 100% stacked bar data: convert counts to percentages
  const cohortData = concludedRounds.map((r) => {
    const p = r.community_cohorts?.promoter || 0;
    const pa = r.community_cohorts?.passive || 0;
    const d = r.community_cohorts?.detractor || 0;
    const total = p + pa + d || 1;
    return {
      name: `R${r.round_number}`,
      Promoter: Math.round((p / total) * 100),
      Passive: Math.round((pa / total) * 100),
      Detractor: Math.round((d / total) * 100),
      details: r.community_details || [],
    };
  });

  // Compute trending topics between consecutive rounds
  const topicTrends = [];
  for (let i = 1; i < concludedRounds.length; i++) {
    const prev = concludedRounds[i - 1];
    const curr = concludedRounds[i];
    const prevFreqs = {};
    const currFreqs = {};
    (prev.word_frequencies || []).forEach((w) => { prevFreqs[w.word] = w.count; });
    (curr.word_frequencies || []).forEach((w) => { currFreqs[w.word] = w.count; });

    const allWords = new Set([...Object.keys(prevFreqs), ...Object.keys(currFreqs)]);
    const rising = [];
    const declining = [];
    const newWords = [];
    const gone = [];

    for (const word of allWords) {
      const prevCount = prevFreqs[word] || 0;
      const currCount = currFreqs[word] || 0;
      const delta = currCount - prevCount;
      if (prevCount === 0 && currCount > 0) {
        newWords.push({ word, count: currCount });
      } else if (currCount === 0 && prevCount > 0) {
        gone.push({ word, count: prevCount });
      } else if (delta > 0) {
        rising.push({ word, delta, count: currCount });
      } else if (delta < 0) {
        declining.push({ word, delta, count: currCount });
      }
    }

    rising.sort((a, b) => b.delta - a.delta);
    declining.sort((a, b) => a.delta - b.delta);
    newWords.sort((a, b) => b.count - a.count);
    gone.sort((a, b) => b.count - a.count);

    topicTrends.push({
      from: prev.round_number,
      to: curr.round_number,
      rising: rising.slice(0, 6),
      declining: declining.slice(0, 6),
      newWords: newWords.slice(0, 6),
      gone: gone.slice(0, 6),
    });
  }

  return (
    <div className="space-y-6">
      {/* NPS Over Time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          NPS Score Over Time
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={npsData} margin={{ top: 25, right: 30, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[npsMin, npsMax]} tick={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="6 4" strokeWidth={1.5} />
            <Tooltip
              formatter={(value) => [`${value > 0 ? "+" : ""}${value}`, "NPS Score"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Line
              type="monotone"
              dataKey="nps"
              stroke="#9CA3AF"
              strokeWidth={2}
              dot={<NpsDot />}
              activeDot={{ r: 8, stroke: "#fff", strokeWidth: 2 }}
            >
              <LabelList content={<NpsLabel />} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Response Rate Over Time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Response Rate Over Time
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={responseData} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value, name, entry) => {
                if (name === "rate") return [`${entry.payload.count} of ${entry.payload.invited} (${value}%)`, "Responses"];
                return [value, name];
              }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="rate" fill={COLORS.blue} radius={[4, 4, 0, 0]}>
              <LabelList
                formatter={(value, entry) => `${value}%`}
                position="top"
                style={{ fontSize: 12, fontWeight: 600, fill: "#374151" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Community Cohorts — 100% Stacked Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Community Cohorts Over Time
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Percentage of communities classified as Promoter, Passive, or Detractor
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={cohortData} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entry = cohortData.find((d) => d.name === label);
                const details = entry?.details || [];
                return (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs max-w-[240px]">
                    <p className="font-semibold text-gray-700 mb-2">{label}</p>
                    {["promoter", "passive", "detractor"].map((cohort) => {
                      const communities = details.filter((d) => d.cohort === cohort);
                      if (communities.length === 0) return null;
                      const color = cohort === "promoter" ? COLORS.promoter
                        : cohort === "passive" ? COLORS.passive : COLORS.detractor;
                      return (
                        <div key={cohort} className="mb-1.5">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: color }} />
                          <span className="font-medium capitalize">{cohort}</span>
                          <span className="text-gray-400 ml-1">({communities.length})</span>
                          <div className="ml-3.5 text-gray-500">
                            {communities.map((c) => c.name).join(", ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend />
            <Bar dataKey="Promoter" stackId="a" fill={COLORS.promoter} radius={[0, 0, 0, 0]}>
              <LabelList
                dataKey="Promoter"
                position="center"
                formatter={(v) => v > 0 ? `${v}%` : ""}
                style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }}
              />
            </Bar>
            <Bar dataKey="Passive" stackId="a" fill={COLORS.passive} radius={[0, 0, 0, 0]}>
              <LabelList
                dataKey="Passive"
                position="center"
                formatter={(v) => v > 0 ? `${v}%` : ""}
                style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }}
              />
            </Bar>
            <Bar dataKey="Detractor" stackId="a" fill={COLORS.detractor} radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="Detractor"
                position="center"
                formatter={(v) => v > 0 ? `${v}%` : ""}
                style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trending Topics */}
      {topicTrends.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Trending Topics
          </p>
          <div className="space-y-6">
            {topicTrends.map((trend) => (
              <div key={`${trend.from}-${trend.to}`}>
                <p className="text-xs font-semibold text-gray-500 mb-3">
                  Round {trend.from} → Round {trend.to}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Rising */}
                  {trend.rising.length > 0 && (
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                        Rising
                      </p>
                      <div className="space-y-1">
                        {trend.rising.map((w) => (
                          <div key={w.word} className="flex justify-between text-xs">
                            <span className="text-gray-700">{w.word}</span>
                            <span className="text-green-600 font-medium">+{w.delta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Declining */}
                  {trend.declining.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        Declining
                      </p>
                      <div className="space-y-1">
                        {trend.declining.map((w) => (
                          <div key={w.word} className="flex justify-between text-xs">
                            <span className="text-gray-700">{w.word}</span>
                            <span className="text-red-600 font-medium">{w.delta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* New and Gone words */}
                {(trend.newWords.length > 0 || trend.gone.length > 0) && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {trend.newWords.length > 0 && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-2">New this round</p>
                        <div className="flex flex-wrap gap-1.5">
                          {trend.newWords.map((w) => (
                            <span key={w.word} className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                              {w.word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {trend.gone.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2">No longer mentioned</p>
                        <div className="flex flex-wrap gap-1.5">
                          {trend.gone.map((w) => (
                            <span key={w.word} className="inline-block px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full text-xs line-through">
                              {w.word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
