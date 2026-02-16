import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { COLORS, npsColor } from "../utils/npsHelpers";
import WordCloud from "./WordCloud";

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
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={npsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [`${value > 0 ? "+" : ""}${value}`, "NPS Score"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Line
              type="monotone"
              dataKey="nps"
              stroke={COLORS.blue}
              strokeWidth={2.5}
              dot={{ fill: COLORS.blue, r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Response Rate Over Time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Response Rate Over Time
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={responseData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "rate") return [`${value}%`, "Response Rate"];
                return [value, name];
              }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="rate" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
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
