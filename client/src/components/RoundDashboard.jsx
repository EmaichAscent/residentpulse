import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { COLORS, barColor, npsColor, copyInsights } from "../utils/npsHelpers";
import WordCloud from "./WordCloud";

export default function RoundDashboard() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNonResponders, setShowNonResponders] = useState(false);
  const [showResponded, setShowResponded] = useState(false);
  const [closingRound, setClosingRound] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissing, setDismissing] = useState(null);
  const [solving, setSolving] = useState(null);
  const [solveNote, setSolveNote] = useState("");
  const [finalizing, setFinalizing] = useState(null);
  const [goalsExpanded, setGoalsExpanded] = useState(false);
  const [expandedCommunities, setExpandedCommunities] = useState({});
  const [filters, setFilters] = useState({ community_id: "", manager: "", property_type: "" });

  useEffect(() => {
    loadDashboard();
  }, [roundId, filters]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.community_id) params.set("community_id", filters.community_id);
      if (filters.manager) params.set("manager", filters.manager);
      if (filters.property_type) params.set("property_type", filters.property_type);
      const qs = params.toString();
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/dashboard${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRound = async () => {
    setClosingRound(true);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmClose(false);
        await loadDashboard();
      }
    } catch (err) {
      console.error("Failed to close round:", err);
    } finally {
      setClosingRound(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/regenerate-insights`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        await loadDashboard();
      }
    } catch (err) {
      console.error("Failed to regenerate:", err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!data?.insights?.executive_summary) return;

    let text = `Executive Summary\n${data.insights.executive_summary}\n\n`;
    if (data.insights.key_findings) {
      text += "Key Findings\n";
      data.insights.key_findings.forEach((f, i) => {
        text += `${i + 1}. ${f.finding}\n`;
      });
      text += "\n";
    }
    if (data.insights.recommended_actions) {
      text += "Recommended Actions\n";
      data.insights.recommended_actions.forEach((a, i) => {
        text += `${i + 1}. [${a.priority?.toUpperCase()}] ${a.action}\n`;
      });
    }

    const ok = await copyInsights(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDismissAlert = async (alertId) => {
    setDismissing(alertId);
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        setData((prev) => ({
          ...prev,
          alerts: prev.alerts.map((a) =>
            a.id === alertId ? { ...a, dismissed: true, dismissed_at: new Date().toISOString() } : a
          ),
        }));
      }
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    } finally {
      setDismissing(null);
    }
  };

  const handleSolveAlert = async (alertId) => {
    setSolving(alertId);
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note: solveNote || null }),
      });
      if (res.ok) {
        setData((prev) => ({
          ...prev,
          alerts: prev.alerts.map((a) =>
            a.id === alertId ? { ...a, solved: true, solved_at: new Date().toISOString(), solve_note: solveNote || null } : a
          ),
        }));
        setSolveNote("");
      }
    } catch (err) {
      console.error("Failed to solve alert:", err);
    } finally {
      setSolving(null);
    }
  };

  const toggleCommunity = (name) => {
    setExpandedCommunities((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleFinalize = async (sessionId) => {
    setFinalizing(sessionId);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/finalize`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        await loadDashboard();
      }
    } catch (err) {
      console.error("Failed to finalize session:", err);
    } finally {
      setFinalizing(null);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading round dashboard...</p>;
  }

  if (!data) {
    return <p className="text-red-500 text-center py-10">Failed to load round data.</p>;
  }

  const { round, nps, response_rate, sessions, non_responders, community_cohorts, is_paid_tier, community_analytics, filter_options, alerts, word_frequencies, insights, interview_summary } = data;

  const formatCurrency = (val) => val != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val) : "$0";
  const formatPropertyType = (t) => ({ condo: "Condo", townhome: "Townhome", single_family: "Single Family", mixed: "Mixed", other: "Other" }[t] || t);
  const isActive = round.status === "in_progress";
  const isConcluded = round.status === "concluded";

  const pPct = nps.total > 0 ? Math.round((nps.promoters / nps.total) * 100) : 0;
  const paPct = nps.total > 0 ? Math.round((nps.passives / nps.total) * 100) : 0;
  const dPct = nps.total > 0 ? Math.round((nps.detractors / nps.total) * 100) : 0;

  const completedSessions = sessions.filter((s) => s.completed);
  const incompleteSessions = sessions.filter((s) => !s.completed && s.nps_score != null);

  // Community cohort chart data
  const cohortChartData = community_cohorts.map((c) => ({
    name: c.name.length > 15 ? c.name.slice(0, 15) + "..." : c.name,
    fullName: c.name,
    median: c.median,
    cohort: c.cohort,
  }));

  // Group alerts by community for warnings section
  const alertsByCommunity = {};
  alerts.forEach((a) => {
    const community = a.alert_community || "Unknown";
    if (!alertsByCommunity[community]) alertsByCommunity[community] = [];
    alertsByCommunity[community].push(a);
  });
  const activeAlertCount = alerts.filter((a) => !a.dismissed && !a.solved).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/rounds")}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Round {round.round_number}</h2>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                isActive ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
              }`}>
                {isActive ? "In Progress" : "Concluded"}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {formatDate(round.launched_at)} — {isConcluded ? formatDate(round.concluded_at) : `Closes ${formatDate(round.closes_at)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/survey-rounds/${roundId}/export`}
            className="py-2 px-4 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"
            download
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Export CSV
          </a>
          {isActive && (
            confirmClose ? (
              <>
                <button
                  onClick={handleCloseRound}
                  disabled={closingRound}
                  className="py-2 px-4 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                >
                  {closingRound ? "Closing..." : "Yes, Close Round"}
                </button>
                <button
                  onClick={() => setConfirmClose(false)}
                  className="py-2 px-4 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmClose(true)}
                className="py-2 px-4 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close Round Early
              </button>
            )
          )}
        </div>
      </div>

      {/* Dashboard Filters (paid tier only) */}
      {is_paid_tier && filter_options && (filter_options.communities.length > 0 || filter_options.managers.length > 0 || filter_options.property_types.length > 0) && (
        <div className="flex gap-3 flex-wrap items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter:</span>
          {filter_options.communities.length > 0 && (
            <select
              value={filters.community_id}
              onChange={(e) => setFilters({ ...filters, community_id: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">All Communities</option>
              {filter_options.communities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {filter_options.managers.length > 0 && (
            <select
              value={filters.manager}
              onChange={(e) => setFilters({ ...filters, manager: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">All Managers</option>
              {filter_options.managers.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {filter_options.property_types.length > 0 && (
            <select
              value={filters.property_type}
              onChange={(e) => setFilters({ ...filters, property_type: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">All Property Types</option>
              {filter_options.property_types.map((t) => (
                <option key={t} value={t}>{formatPropertyType(t)}</option>
              ))}
            </select>
          )}
          {(filters.community_id || filters.manager || filters.property_type) && (
            <button
              onClick={() => setFilters({ community_id: "", manager: "", property_type: "" })}
              className="text-xs font-medium px-2 py-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Response Rate + NPS */}
      <div className="grid grid-cols-2 gap-4">
        {/* Response Rate */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Response Rate</p>
          <div className="text-center mb-3">
            <p className="text-4xl font-bold" style={{ color: "var(--cam-blue)" }}>
              {response_rate.percentage}%
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {response_rate.completed} of {response_rate.invited} responded
            </p>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${response_rate.percentage}%`, backgroundColor: "var(--cam-blue)" }}
            />
          </div>
        </div>

        {/* NPS Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">NPS Score</p>
          {nps.total > 0 ? (
            <>
              <div className="text-center mb-3">
                <p className="text-4xl font-bold" style={{ color: npsColor(nps.score) }}>
                  {nps.score > 0 ? "+" : ""}{nps.score}
                </p>
                <p className="text-sm text-gray-500 mt-1">{nps.total} respondent{nps.total !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex rounded-lg overflow-hidden h-6 text-xs font-semibold text-white">
                {pPct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${pPct}%`, backgroundColor: COLORS.promoter }}>
                    {pPct}%
                  </div>
                )}
                {paPct > 0 && (
                  <div className="flex items-center justify-center text-gray-800" style={{ width: `${paPct}%`, backgroundColor: COLORS.passive }}>
                    {paPct}%
                  </div>
                )}
                {dPct > 0 && (
                  <div className="flex items-center justify-center" style={{ width: `${dPct}%`, backgroundColor: COLORS.detractor }}>
                    {dPct}%
                  </div>
                )}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.promoter }} />Promoters ({nps.promoters})</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.passive }} />Passives ({nps.passives})</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.detractor }} />Detractors ({nps.detractors})</span>
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">No responses yet</p>
          )}
        </div>
      </div>

      {/* Warnings Section — grouped by community */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Warnings</p>
            {activeAlertCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {activeAlertCount} active
              </span>
            )}
          </div>
          <div className="space-y-2">
            {Object.entries(alertsByCommunity).map(([community, communityAlerts]) => {
              const communityActive = communityAlerts.filter((a) => !a.dismissed && !a.solved).length;
              const isExpanded = expandedCommunities[community];
              return (
                <div key={community} className="border border-gray-100 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCommunity(community)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{community}</span>
                      <span className="text-xs text-gray-500">({communityAlerts.length} alert{communityAlerts.length !== 1 ? "s" : ""})</span>
                      {communityActive > 0 && (
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {communityAlerts.map((alert) => {
                        const isActive = !alert.dismissed && !alert.solved;
                        const isSolved = alert.solved;
                        const isDismissed = alert.dismissed;
                        const memberName = alert.first_name || alert.last_name
                          ? `${alert.first_name || ""} ${alert.last_name || ""}`.trim()
                          : alert.user_email;

                        return (
                          <div key={alert.id} className={`rounded-lg border p-3 ${
                            isSolved ? "bg-green-50 border-green-200" :
                            isDismissed ? "bg-gray-50 border-gray-200" :
                            alert.severity === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                          }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    alert.alert_type === "contract_termination" ? "bg-red-100 text-red-700" :
                                    alert.alert_type === "legal_threat" ? "bg-purple-100 text-purple-700" :
                                    alert.alert_type === "safety_concern" ? "bg-orange-100 text-orange-700" :
                                    "bg-gray-100 text-gray-700"
                                  }`}>
                                    {alert.alert_type?.replace(/_/g, " ")}
                                  </span>
                                  {isSolved && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Solved</span>}
                                  {isDismissed && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Dismissed</span>}
                                </div>
                                <p className={`text-sm ${isSolved ? "text-green-800" : isDismissed ? "text-gray-500" : "text-gray-800"}`}>
                                  <strong>{memberName}</strong> — {alert.description}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">{formatDate(alert.created_at)}</p>
                                {isSolved && alert.solve_note && (
                                  <p className="text-xs text-green-700 mt-1 italic">Note: {alert.solve_note}</p>
                                )}
                              </div>
                              {isActive && (
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                  {solving === alert.id ? (
                                    <div className="space-y-1">
                                      <textarea
                                        value={solveNote}
                                        onChange={(e) => setSolveNote(e.target.value)}
                                        placeholder="Optional note..."
                                        className="text-xs border border-gray-300 rounded p-1.5 w-36 h-14 resize-none"
                                      />
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => handleSolveAlert(alert.id)}
                                          className="text-xs font-semibold px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => { setSolving(null); setSolveNote(""); }}
                                          className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => setSolving(alert.id)}
                                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition"
                                      >
                                        Mark Solved
                                      </button>
                                      <button
                                        onClick={() => handleDismissAlert(alert.id)}
                                        disabled={dismissing === alert.id}
                                        className="text-xs text-gray-400 hover:text-gray-600"
                                      >
                                        Dismiss
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Your Stated Goals (from onboarding interview) */}
      {interview_summary && (
        <div className="bg-blue-50/60 rounded-xl border border-blue-100 p-5">
          <button
            onClick={() => setGoalsExpanded(!goalsExpanded)}
            className="w-full flex items-center justify-between"
          >
            <span className="text-sm font-semibold text-gray-700">Your Stated Goals</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${goalsExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {goalsExpanded && (
            <p className="mt-3 text-sm text-gray-600 italic leading-relaxed whitespace-pre-line">
              {interview_summary}
            </p>
          )}
        </div>
      )}

      {/* Community Cohorts */}
      {community_cohorts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Community Scores
          </p>
          <p className="text-xs text-gray-400 mb-4">Median NPS per community</p>
          <ResponsiveContainer width="100%" height={Math.max(180, community_cohorts.length * 40)}>
            <BarChart data={cohortChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, _name, props) => [value, `Median NPS (${props.payload.fullName})`]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Bar dataKey="median" radius={[0, 4, 4, 0]}>
                {cohortChartData.map((c, i) => (
                  <Cell
                    key={i}
                    fill={c.cohort === "promoter" ? COLORS.promoter : c.cohort === "passive" ? COLORS.passive : COLORS.detractor}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3 text-xs text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.promoter }} />Promoter (9-10)</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.passive }} />Passive (7-8)</span>
            <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS.detractor }} />Detractor (0-6)</span>
          </div>
        </div>
      )}

      {/* Paid Tier Community Analytics */}
      {is_paid_tier && community_analytics && (
        <>
          {/* Revenue at Risk */}
          {community_analytics.revenue_at_risk.total_portfolio_value > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Revenue at Risk</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(community_analytics.revenue_at_risk.total_portfolio_value)}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Portfolio</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(community_analytics.revenue_at_risk.at_risk_value)}</p>
                  <p className="text-xs text-gray-500 mt-1">At Risk</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{
                    color: community_analytics.revenue_at_risk.percent_at_risk > 20 ? "#EF4444"
                      : community_analytics.revenue_at_risk.percent_at_risk > 10 ? "#F59E0B" : "#1AB06E"
                  }}>
                    {community_analytics.revenue_at_risk.percent_at_risk}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">% at Risk</p>
                </div>
              </div>
              {community_analytics.revenue_at_risk.at_risk_communities.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">At-Risk Communities (Detractor NPS)</p>
                  <div className="space-y-2">
                    {community_analytics.revenue_at_risk.at_risk_communities.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 px-3 bg-red-50 rounded-lg">
                        <span className="font-medium text-gray-900">{c.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-gray-600">{formatCurrency(c.contract_value)}</span>
                          <span className="font-semibold text-red-600">NPS {c.median}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manager Performance */}
          {community_analytics.manager_performance.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Manager Performance</p>
              <div className="space-y-3">
                {community_analytics.manager_performance.map((m, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.manager}</p>
                      <p className="text-xs text-gray-500">
                        {m.communities} communit{m.communities === 1 ? "y" : "ies"} · {m.respondents} respondent{m.respondents !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(5, Math.min(100, (m.nps + 100) / 2))}%`,
                            backgroundColor: m.nps >= 50 ? COLORS.promoter : m.nps >= 0 ? COLORS.passive : COLORS.detractor,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold w-12 text-right" style={{ color: npsColor(m.nps) }}>
                        {m.nps > 0 ? "+" : ""}{m.nps}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Property Type Analysis */}
          {community_analytics.property_type_analysis.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Property Type Analysis</p>
              <div className="space-y-3">
                {community_analytics.property_type_analysis.map((pt, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{formatPropertyType(pt.property_type)}</p>
                      <p className="text-xs text-gray-500">
                        {pt.communities} communit{pt.communities === 1 ? "y" : "ies"} · {pt.respondents} respondent{pt.respondents !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(5, Math.min(100, (pt.nps + 100) / 2))}%`,
                            backgroundColor: pt.nps >= 50 ? COLORS.promoter : pt.nps >= 0 ? COLORS.passive : COLORS.detractor,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold w-12 text-right" style={{ color: npsColor(pt.nps) }}>
                        {pt.nps > 0 ? "+" : ""}{pt.nps}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Size-Based Trends */}
          {community_analytics.size_trends.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Size-Based Trends</p>
              <p className="text-xs text-gray-400 mb-4">Community size vs. satisfaction</p>
              <div className="space-y-2">
                {community_analytics.size_trends.map((s, i) => (
                  <div key={i} className="flex items-center gap-4 text-sm py-1.5">
                    <span className="font-medium text-gray-900 flex-1 truncate">{s.name}</span>
                    <span className="text-gray-500 w-20 text-right">{s.units} units</span>
                    <span className="font-semibold w-16 text-right" style={{ color: barColor(s.median) }}>
                      NPS {s.median}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Word Cloud */}
      {word_frequencies && word_frequencies.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Topics Mentioned {isActive && <span className="text-xs font-normal text-gray-400">(live)</span>}
          </p>
          <WordCloud frequencies={word_frequencies} />
        </div>
      )}

      {/* Who Responded / Who Hasn't */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <button
            onClick={() => setShowResponded(!showResponded)}
            className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
          >
            <span>Responded ({completedSessions.length})</span>
            <svg className={`w-4 h-4 transition-transform ${showResponded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showResponded && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {completedSessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-700">{s.first_name || s.last_name ? `${s.first_name || ""} ${s.last_name || ""}`.trim() : s.email}</span>
                  <span className={`font-semibold ${s.nps_score >= 9 ? "text-green-600" : s.nps_score >= 7 ? "text-yellow-600" : "text-red-600"}`}>
                    {s.nps_score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <button
            onClick={() => setShowNonResponders(!showNonResponders)}
            className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
          >
            <span>Not Responded ({non_responders.length})</span>
            <svg className={`w-4 h-4 transition-transform ${showNonResponders ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showNonResponders && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {non_responders.map((u) => (
                <div key={u.id} className="text-sm text-gray-500 py-1">
                  {u.first_name || u.last_name ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : u.email}
                  {u.community_name && <span className="text-xs text-gray-400 ml-2">({u.community_name})</span>}
                </div>
              ))}
              {non_responders.length === 0 && (
                <p className="text-sm text-gray-400">Everyone has responded!</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Respondent Summaries */}
      {completedSessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Respondent Summaries
          </p>
          <div className="space-y-4">
            {completedSessions.map((s) => (
              <div key={s.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-900">
                      {s.first_name || s.last_name ? `${s.first_name || ""} ${s.last_name || ""}`.trim() : s.email}
                    </span>
                    {s.community_name && (
                      <span className="text-sm text-gray-500 ml-2">({s.community_name})</span>
                    )}
                  </div>
                  <span
                    className="text-lg font-bold"
                    style={{ color: barColor(s.nps_score) }}
                  >
                    {s.nps_score}
                  </span>
                </div>
                {s.summary ? (
                  <p className="text-sm text-gray-600 leading-relaxed">{s.summary}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Summary not yet available</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incomplete Sessions (abandoned / in progress) */}
      {incompleteSessions.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold text-gray-700">
              Incomplete Responses ({incompleteSessions.length})
            </p>
            <p className="text-xs text-gray-400">
              These board members started but didn't finish. Finalize to include their feedback.
            </p>
          </div>
          <div className="space-y-3">
            {incompleteSessions.map((s) => (
              <div key={s.id} className="border border-amber-100 bg-amber-50/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">
                      {s.first_name || s.last_name ? `${s.first_name || ""} ${s.last_name || ""}`.trim() : s.email}
                    </span>
                    {s.community_name && (
                      <span className="text-sm text-gray-500 ml-2">({s.community_name})</span>
                    )}
                    <span className="text-xs text-gray-400 ml-2">NPS: {s.nps_score}</span>
                  </div>
                  <button
                    onClick={() => handleFinalize(s.id)}
                    disabled={finalizing === s.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 text-white"
                    style={{ backgroundColor: "var(--cam-blue)" }}
                  >
                    {finalizing === s.id ? "Finalizing..." : "Finalize"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Insights (concluded only) */}
      {isConcluded && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <a href="https://camascent.com" target="_blank" rel="noopener noreferrer">
                <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
              </a>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--cam-green)" }}>
                  AI Insights by CAM Ascent Analytics
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generated {insights?.generated_at ? formatDate(insights.generated_at) : "automatically on round close"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {insights && (
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {regenerating ? "Generating..." : insights ? "Regenerate" : "Generate Insights"}
              </button>
            </div>
          </div>

          {insights ? (
            <div className="space-y-6">
              {/* Executive Summary */}
              {insights.executive_summary && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-100">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Executive Summary</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{insights.executive_summary}</p>
                </div>
              )}

              {/* Key Findings */}
              {insights.key_findings?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3">Key Findings</h4>
                  <div className="space-y-3">
                    {insights.key_findings.map((f, i) => (
                      <div key={i} className="flex gap-3">
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${
                          f.severity === "positive" ? "bg-green-100 text-green-700" :
                          f.severity === "critical" ? "bg-red-100 text-red-700" :
                          f.severity === "concerning" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{f.finding}</p>
                          {f.evidence && <p className="text-xs text-gray-500 mt-0.5">{f.evidence}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Actions */}
              {insights.recommended_actions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3">Recommended Actions</h4>
                  <div className="space-y-3">
                    {insights.recommended_actions.map((a, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            a.priority === "high" ? "bg-red-100 text-red-700" :
                            a.priority === "medium" ? "bg-amber-100 text-amber-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {a.priority?.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{a.action}</span>
                        </div>
                        {a.impact && <p className="text-xs text-gray-500 mt-1">{a.impact}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CAM Ascent Callouts */}
              {insights.cam_ascent_callouts?.length > 0 && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-5 border border-emerald-100">
                  <h4 className="text-sm font-bold mb-3" style={{ color: "var(--cam-green)" }}>
                    Where CAM Ascent Can Help
                  </h4>
                  <div className="space-y-3">
                    {insights.cam_ascent_callouts.map((c, i) => (
                      <div key={i}>
                        <p className="text-sm font-medium text-gray-900">{c.area}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{c.opportunity}</p>
                        {c.suggested_service && (
                          <p className="text-xs mt-1" style={{ color: "var(--cam-green)" }}>
                            {c.suggested_service}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">
              {regenerating
                ? "Generating AI insights — this may take a moment..."
                : "AI insights will be generated automatically. Click 'Generate Insights' to create them now."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
