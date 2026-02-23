import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine, LabelList,
} from "recharts";
import { COLORS, npsColor } from "../utils/npsHelpers";
import WordCloud from "./WordCloud";

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

/* Delta label between two NPS points */
function DeltaLabels({ data, chart }) {
  if (!chart || !data || data.length < 2) return null;
  const labels = [];
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const delta = curr.nps - prev.nps;
    if (delta === 0) continue;

    // Position at midpoint between two dots
    const xScale = chart.xAxisMap?.[0];
    const yScale = chart.yAxisMap?.[0];
    if (!xScale || !yScale) continue;

    const x1 = xScale.scale(prev.name) + (xScale.bandSize || 0) / 2;
    const x2 = xScale.scale(curr.name) + (xScale.bandSize || 0) / 2;
    const midX = (x1 + x2) / 2;
    const midY = yScale.scale((prev.nps + curr.nps) / 2);

    labels.push(
      <text
        key={i}
        x={midX} y={midY - 8}
        textAnchor="middle" fontSize={11} fontWeight={500}
        fill="#6B7280"
      >
        {delta > 0 ? `+${delta}` : delta}
      </text>
    );
  }
  return <g>{labels}</g>;
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

  const cohortData = concludedRounds.map((r) => ({
    name: `R${r.round_number}`,
    Promoter: r.community_cohorts?.promoter || 0,
    Passive: r.community_cohorts?.passive || 0,
    Detractor: r.community_cohorts?.detractor || 0,
  }));

  // Get word clouds from last 2 rounds
  const lastTwo = [...concludedRounds].reverse().slice(0, 2).reverse();

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

      {/* Community Cohort Stacked Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Community Cohorts Over Time
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Number of communities classified as Promoter, Passive, or Detractor per round
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={cohortData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend />
            <Bar dataKey="Promoter" stackId="a" fill={COLORS.promoter} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Passive" stackId="a" fill={COLORS.passive} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Detractor" stackId="a" fill={COLORS.detractor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Word Cloud Comparison */}
      {lastTwo.length === 2 && lastTwo.some((r) => r.word_frequencies) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Word Cloud Comparison
          </p>
          <div className="grid grid-cols-2 gap-6">
            {lastTwo.map((r) => (
              <div key={r.id}>
                <p className="text-xs font-semibold text-gray-500 text-center mb-3">
                  Round {r.round_number}
                </p>
                <div className="bg-gray-50 rounded-lg p-4 min-h-[160px] flex items-center justify-center">
                  <WordCloud frequencies={r.word_frequencies} maxWords={30} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
