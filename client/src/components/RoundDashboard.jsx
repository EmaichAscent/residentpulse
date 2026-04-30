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
  const [filters, setFilters] = useState({ community_id: "", manager: "", property_type: "", location: "" });
  const [showAllCommunities, setShowAllCommunities] = useState(false);
  const [showAllManagers, setShowAllManagers] = useState(false);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);
  const [showAllSize, setShowAllSize] = useState(false);
  const [showSummaries, setShowSummaries] = useState(false);
  const [includeSummariesInPrint, setIncludeSummariesInPrint] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

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
      if (filters.location) params.set("location", filters.location);
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
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to finalize this response. Please try again or contact support.");
      }
    } catch (err) {
      console.error("Failed to finalize session:", err);
      alert("Network error while finalizing. Please check your connection and try again.");
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

  const { round, nps, response_rate, sessions, non_responders, community_cohorts, is_paid_tier, community_analytics, filter_options, alerts, word_frequencies, insights, interview_summary, delivery } = data;

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

  const handlePrintReport = () => {
    const w = window.open("", "_blank");
    if (!w) return;

    const npsBarHtml = `
      <div style="display:flex;height:20px;border-radius:6px;overflow:hidden;margin:8px 0;">
        ${pPct > 0 ? `<div style="width:${pPct}%;background:#22c55e;"></div>` : ""}
        ${paPct > 0 ? `<div style="width:${paPct}%;background:#f59e0b;"></div>` : ""}
        ${dPct > 0 ? `<div style="width:${dPct}%;background:#ef4444;"></div>` : ""}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#666;">
        <span style="color:#22c55e;">Promoters ${pPct}%</span>
        <span style="color:#f59e0b;">Passives ${paPct}%</span>
        <span style="color:#ef4444;">Detractors ${dPct}%</span>
      </div>`;

    const communityRows = community_cohorts.map(c =>
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${c.name}</td>
       <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${
         c.median >= 9 ? "#22c55e" : c.median >= 7 ? "#f59e0b" : "#ef4444"
       };">${c.median}</td>
       <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.respondents || ""}</td></tr>`
    ).join("");

    const ca = community_analytics;
    const npsColorFn = (v) => v >= 50 ? "#22c55e" : v >= 0 ? "#f59e0b" : "#ef4444";

    // Revenue at Risk
    let revenueHtml = "";
    if (ca?.revenue_at_risk?.total_portfolio_value > 0) {
      const rar = ca.revenue_at_risk;
      revenueHtml = `<h2 style="margin-top:28px;">Revenue at Risk</h2>
        <div style="display:flex;gap:24px;margin:12px 0;">
          <div><strong style="font-size:20px;">${formatCurrency(rar.total_portfolio_value)}</strong><br><span style="font-size:12px;color:#666;">Total Portfolio</span></div>
          <div><strong style="font-size:20px;color:#ef4444;">${formatCurrency(rar.at_risk_value)}</strong><br><span style="font-size:12px;color:#666;">At Risk</span></div>
          <div><strong style="font-size:20px;color:${rar.percent_at_risk > 20 ? "#ef4444" : rar.percent_at_risk > 10 ? "#f59e0b" : "#22c55e"};">${rar.percent_at_risk}%</strong><br><span style="font-size:12px;color:#666;">% at Risk</span></div>
        </div>`;
      if (rar.at_risk_communities?.length > 0) {
        revenueHtml += `<table><thead><tr><th>At-Risk Community</th><th style="text-align:right;">Contract Value</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
        rar.at_risk_communities.forEach(c => {
          revenueHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${c.name}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(c.contract_value)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:#ef4444;">${c.median}</td></tr>`;
        });
        revenueHtml += `</tbody></table>`;
      }
    }

    // Manager Performance
    let managerHtml = "";
    if (ca?.manager_performance?.length > 0) {
      managerHtml = `<h2 style="margin-top:28px;">Manager Performance</h2><table><thead><tr><th>Manager</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.manager_performance.forEach(m => {
        managerHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${m.manager}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${m.communities}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${m.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(m.nps)};">${m.nps > 0 ? "+" : ""}${m.nps}</td></tr>`;
      });
      managerHtml += `</tbody></table>`;
    }

    // Location Performance
    let locationHtml = "";
    if (ca?.location_performance?.length > 0) {
      locationHtml = `<h2 style="margin-top:28px;">NPS by Location</h2><table><thead><tr><th>Location</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.location_performance.forEach(l => {
        locationHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${l.location}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${l.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(l.nps)};">${l.nps > 0 ? "+" : ""}${l.nps}</td></tr>`;
      });
      locationHtml += `</tbody></table>`;
    }

    // Property Type Analysis
    let propertyHtml = "";
    if (ca?.property_type_analysis?.length > 0) {
      propertyHtml = `<h2 style="margin-top:28px;">Property Type Analysis</h2><table><thead><tr><th>Property Type</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.property_type_analysis.forEach(pt => {
        propertyHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${formatPropertyType(pt.property_type)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${pt.communities}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${pt.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(pt.nps)};">${pt.nps > 0 ? "+" : ""}${pt.nps}</td></tr>`;
      });
      propertyHtml += `</tbody></table>`;
    }

    // Size-Based Trends
    let sizeHtml = "";
    if (ca?.size_trends?.length > 0) {
      sizeHtml = `<h2 style="margin-top:28px;">Size-Based Trends</h2><table><thead><tr><th>Cohort</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.size_trends.forEach(s => {
        const npsVal = s.nps ?? s.median ?? 0;
        sizeHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${s.communities || ""}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${s.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(npsVal)};">${npsVal > 0 ? "+" : ""}${npsVal}</td></tr>`;
      });
      sizeHtml += `</tbody></table>`;
    }

    // Summaries (optional)
    let summaryHtml = "";
    if (includeSummariesInPrint && completedSessions.length > 0) {
      summaryHtml = `<h2 style="margin-top:28px;">Respondent Summaries (${completedSessions.length})</h2>`;
      completedSessions.forEach(s => {
        summaryHtml += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <strong>${[s.first_name, s.last_name].filter(Boolean).join(" ") || "Anonymous"}</strong>
            <span style="font-weight:600;color:${s.nps_score >= 9 ? "#22c55e" : s.nps_score >= 7 ? "#f59e0b" : "#ef4444"};">NPS: ${s.nps_score ?? "—"}</span>
          </div>
          ${s.community_name ? `<div style="font-size:12px;color:#666;margin-bottom:4px;">${s.community_name}</div>` : ""}
          ${s.summary ? `<div style="font-size:13px;color:#333;">${s.summary}</div>` : ""}
        </div>`;
      });
    }

    let insightsHtml = "";
    if (insights?.executive_summary && !insights.error) {
      insightsHtml += `<h2 style="margin-top:28px;">Executive Summary</h2><p>${insights.executive_summary}</p>`;
    }
    if (insights?.key_findings?.length) {
      insightsHtml += `<h2 style="margin-top:20px;">Key Findings</h2><ol>`;
      insights.key_findings.forEach(f => {
        const badge = f.severity === "positive" ? "color:#22c55e;" : f.severity === "critical" ? "color:#ef4444;" : f.severity === "concerning" ? "color:#f59e0b;" : "color:#666;";
        insightsHtml += `<li style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;${badge}text-transform:uppercase;">${f.severity || ""}</span> <strong>${f.finding}</strong>${f.evidence ? `<br><span style="color:#666;font-size:13px;">${f.evidence}</span>` : ""}</li>`;
      });
      insightsHtml += `</ol>`;
    }
    if (insights?.recommended_actions?.length) {
      insightsHtml += `<h2 style="margin-top:20px;">Recommended Actions</h2><ol>`;
      insights.recommended_actions.forEach(a => {
        const pColor = a.priority === "high" ? "#ef4444" : a.priority === "keep_doing" ? "#22c55e" : a.priority === "medium" ? "#f59e0b" : "#666";
        insightsHtml += `<li style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;color:${pColor};text-transform:uppercase;">${a.priority === "keep_doing" ? "KEEP DOING" : a.priority || ""}</span> ${a.action}${a.impact ? `<br><span style="color:#666;font-size:13px;">${a.impact}</span>` : ""}</li>`;
      });
      insightsHtml += `</ol>`;
    }
    if (insights?.cam_ascent_callouts?.length) {
      insightsHtml += `<h2 style="margin-top:20px;">Where CAM Ascent Can Help</h2>`;
      insights.cam_ascent_callouts.forEach(c => {
        insightsHtml += `<div style="margin-bottom:8px;"><strong>${c.area}</strong><br><span style="color:#666;font-size:13px;">${c.opportunity}</span>${c.suggested_service ? `<br><span style="color:#1AB06E;font-size:13px;">${c.suggested_service}</span>` : ""}</div>`;
      });
    }

    let alertsHtml = "";
    const activeAlerts = alerts.filter(a => !a.dismissed);
    if (activeAlerts.length > 0) {
      alertsHtml = `<h2 style="margin-top:28px;color:#dc2626;">Warnings &amp; Alerts (${activeAlerts.length})</h2>`;
      activeAlerts.forEach(a => {
        alertsHtml += `<div style="border-left:3px solid ${a.severity === "critical" ? "#ef4444" : "#f59e0b"};padding:8px 12px;margin-bottom:6px;background:#fef2f2;border-radius:0 6px 6px 0;">
          <strong>${a.alert_community || ""}</strong> — ${a.description}${a.solved ? ' <span style="color:#22c55e;">(Resolved)</span>' : ""}
        </div>`;
      });
    }

    // Active filter note
    const hasActiveFilters = filters.community_id || filters.manager || filters.property_type || filters.location;
    const filterParts = [];
    if (filters.community_id) filterParts.push("Community: " + (filter_options?.communities?.find(c => c.id == filters.community_id)?.name || filters.community_id));
    if (filters.manager) filterParts.push("Manager: " + filters.manager);
    if (filters.property_type) filterParts.push("Type: " + formatPropertyType(filters.property_type));
    if (filters.location) filterParts.push("Location: " + filters.location);
    const filterNote = hasActiveFilters
      ? `<p style="font-size:12px;color:#3B9FE7;margin:8px 0;font-style:italic;">Filtered by: ${filterParts.join(", ")}</p>`
      : "";

    w.document.write(`<!DOCTYPE html><html><head><title>Round ${round.round_number} Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #333; font-size: 14px; line-height: 1.5; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { text-align: left; padding: 8px 12px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; font-size: 12px; text-transform: uppercase; color: #666; }
        .metrics { display: flex; gap: 16px; margin: 16px 0; }
        .metric-card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
        .metric-value { font-size: 32px; font-weight: 700; }
        .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
        @media print { body { padding: 0; } .no-print { display: none !important; } }
      </style>
    </head><body>
      <div class="no-print" style="margin-bottom:16px;">
        <button onclick="window.print()" style="padding:8px 20px;background:#3B9FE7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Print / Save as PDF</button>
        <button onclick="window.close()" style="padding:8px 20px;background:#f3f4f6;color:#333;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;margin-left:8px;">Close</button>
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <img src="/api/admin/account/logo" style="height:40px;max-width:160px;object-fit:contain;" onerror="this.style.display='none'" />
        <div>
          <h1 style="margin-bottom:0;">Survey Round ${round.round_number} Report</h1>
          <p style="color:#666;margin-top:2px;">${formatDate(round.launched_at)} — ${isConcluded ? formatDate(round.concluded_at) : `Closes ${formatDate(round.closes_at)}`} | ${isActive ? "In Progress" : "Concluded"}</p>
        </div>
      </div>
      ${filterNote}

      <div class="metrics">
        <div class="metric-card">
          <div class="metric-value" style="color:${npsColor(nps.score)};">${nps.score ?? "—"}</div>
          <div class="metric-label">NPS Score</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${response_rate.percentage}%</div>
          <div class="metric-label">Response Rate</div>
          <div style="font-size:12px;color:#666;">${response_rate.completed} of ${response_rate.invited}</div>
        </div>
      </div>

      ${npsBarHtml}
      ${revenueHtml}
      ${alertsHtml}

      ${community_cohorts.length > 1 ? `
        <h2 style="margin-top:28px;">Community Scores</h2>
        <table>
          <thead><tr><th>Community</th><th style="text-align:center;">Median NPS</th><th style="text-align:center;">Respondents</th></tr></thead>
          <tbody>${communityRows}</tbody>
        </table>
      ` : ""}

      ${managerHtml}
      ${locationHtml}
      ${propertyHtml}
      ${sizeHtml}

      ${insightsHtml}

      ${summaryHtml}

      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#999;">
        Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} — ResidentPulse by CAM Ascent
      </div>
    </body></html>`);
    w.document.close();
  };

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
          <button
            onClick={handlePrintReport}
            className="py-2 px-4 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.06.734.19 1.053.382a2.249 2.249 0 011.197 1.981v4.585a2.25 2.25 0 01-2.25 2.25H15v1.75A2.75 2.75 0 0112.25 18h-4.5A2.75 2.75 0 015 15.25V15H5a2.25 2.25 0 01-2.25-2.25V8.665a2.249 2.249 0 011.197-1.981A2.25 2.25 0 015 6.302V2.75zm1.5 0v3.5h7v-3.5a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25zm-1.5 9v3.5c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25v-3.5H5z" clipRule="evenodd" />
            </svg>
            Print Report
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSummariesInPrint}
              onChange={(e) => setIncludeSummariesInPrint(e.target.checked)}
              className="rounded border-gray-300"
            />
            Include summaries in print
          </label>
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
      {filter_options && (filter_options.communities.length > 0 || filter_options.managers.length > 0 || filter_options.property_types.length > 0 || filter_options.locations?.length > 0) && (
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
          {filter_options.locations?.length > 0 && (
            <select
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="">All Locations</option>
              {filter_options.locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
          {(filters.community_id || filters.manager || filters.property_type || filters.location) && (
            <button
              onClick={() => setFilters({ community_id: "", manager: "", property_type: "", location: "" })}
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

          {delivery && delivery.total > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 uppercase font-semibold tracking-wide">Email Delivery</span>
                <button
                  onClick={() => navigate("/admin/members")}
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--cam-blue)" }}
                  title="View detailed delivery status per member on the Members tab"
                >
                  View details →
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {(delivery.delivered + delivery.sent) > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {delivery.delivered + delivery.sent} delivered
                  </span>
                )}
                {delivery.bounced > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {delivery.bounced} bounced
                  </span>
                )}
                {delivery.complained > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {delivery.complained} complained
                  </span>
                )}
              </div>
            </div>
          )}
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
      {alerts.length > 0 && (() => {
        const allCommunityAlerts = Object.entries(alertsByCommunity);
        const ALERT_LIMIT = 10;
        const displayAlerts = showAllAlerts ? allCommunityAlerts : allCommunityAlerts.slice(0, ALERT_LIMIT);
        return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Warnings</p>
              {activeAlertCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {activeAlertCount} active across {allCommunityAlerts.length} communities
                </span>
              )}
            </div>
            {allCommunityAlerts.length > ALERT_LIMIT && (
              <button onClick={() => setShowAllAlerts(!showAllAlerts)} className="text-xs font-medium hover:underline" style={{ color: "var(--cam-blue)" }}>
                {showAllAlerts ? "Show Less" : `Show All ${allCommunityAlerts.length} Communities`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {displayAlerts.map(([community, communityAlerts]) => {
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
        );
      })()}

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
      {community_cohorts.length > 0 && (() => {
        const LIMIT = 10;
        const needsTrim = cohortChartData.length > LIMIT && !showAllCommunities;
        const sorted = [...cohortChartData].sort((a, b) => b.median - a.median);
        const displayData = needsTrim
          ? [...sorted.slice(-5), ...sorted.slice(0, 5)]
          : sorted;
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Community Scores
              </p>
              {cohortChartData.length > LIMIT && (
                <button onClick={() => setShowAllCommunities(!showAllCommunities)} className="text-xs font-medium hover:underline" style={{ color: "var(--cam-blue)" }}>
                  {showAllCommunities ? "Show Top/Bottom 5" : `Show All ${cohortChartData.length}`}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Median NPS per community{needsTrim ? " (top 5 + bottom 5)" : ""}
            </p>
            <ResponsiveContainer width="100%" height={Math.max(180, displayData.length * 40)}>
              <BarChart data={displayData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, _name, props) => [value, `Median NPS (${props.payload.fullName})`]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="median" radius={[0, 4, 4, 0]}>
                  {displayData.map((c, i) => (
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
        );
      })()}

      {/* Paid Tier Community Analytics */}
      {community_analytics && (
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
              {community_analytics.revenue_at_risk.at_risk_communities.length > 0 && (() => {
                const atRisk = community_analytics.revenue_at_risk.at_risk_communities;
                const displayAtRisk = showAllAtRisk ? atRisk : atRisk.slice(0, 10);
                return (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">At-Risk Communities (Detractor NPS)</p>
                    <div className="space-y-2">
                      {displayAtRisk.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1.5 px-3 bg-red-50 rounded-lg">
                          <span className="font-medium text-gray-900">{c.name}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-gray-600">{formatCurrency(c.contract_value)}</span>
                            <span className="font-semibold text-red-600">NPS {c.median}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {atRisk.length > 10 && (
                      <button onClick={() => setShowAllAtRisk(!showAllAtRisk)} className="text-xs font-medium mt-2 hover:underline" style={{ color: "var(--cam-blue)" }}>
                        {showAllAtRisk ? "Show Less" : `Show All ${atRisk.length} At-Risk Communities`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* NPS by Location */}
          {community_analytics.location_performance && community_analytics.location_performance.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">NPS by Location</p>
              <div className="space-y-3">
                {community_analytics.location_performance.map((l, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{l.location}</p>
                      <p className="text-xs text-gray-500">
                        {l.respondents} respondent{l.respondents !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(5, Math.min(100, (l.nps + 100) / 2))}%`,
                            backgroundColor: l.nps >= 50 ? COLORS.promoter : l.nps >= 0 ? COLORS.passive : COLORS.detractor,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold w-12 text-right" style={{ color: npsColor(l.nps) }}>
                        {l.nps > 0 ? "+" : ""}{l.nps}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manager Performance */}
          {community_analytics.manager_performance.length > 0 && (() => {
            const managers = community_analytics.manager_performance;
            const LIMIT = 10;
            const needsTrim = managers.length > LIMIT && !showAllManagers;
            const sorted = [...managers].sort((a, b) => a.nps - b.nps);
            const displayManagers = needsTrim
              ? [...sorted.slice(0, 5), ...sorted.slice(-5)]
              : managers;
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                    Manager Performance{needsTrim ? " (top 5 + bottom 5)" : ""}
                  </p>
                  {managers.length > LIMIT && (
                    <button onClick={() => setShowAllManagers(!showAllManagers)} className="text-xs font-medium hover:underline" style={{ color: "var(--cam-blue)" }}>
                      {showAllManagers ? "Show Top/Bottom 5" : `Show All ${managers.length}`}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {displayManagers.map((m, i) => (
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
            );
          })()}

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
              <p className="text-xs text-gray-400 mb-4">NPS by community portfolio size</p>
              <div className="space-y-3">
                {community_analytics.size_trends.map((s, i) => {
                  const npsVal = s.nps ?? s.median ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500">
                          {s.communities ? `${s.communities} communit${s.communities === 1 ? "y" : "ies"} · ` : ""}{s.respondents} respondent{s.respondents !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(5, Math.min(100, (npsVal + 100) / 2))}%`,
                              backgroundColor: npsVal >= 50 ? COLORS.promoter : npsVal >= 0 ? COLORS.passive : COLORS.detractor,
                            }}
                          />
                        </div>
                        <span className="text-sm font-bold w-12 text-right" style={{ color: npsColor(npsVal) }}>
                          {npsVal > 0 ? "+" : ""}{npsVal}
                        </span>
                      </div>
                    </div>
                  );
                })}
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

          {insights?.error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-center">
              <p className="text-sm text-red-700 font-medium mb-2">{insights.message}</p>
              <p className="text-xs text-red-500 mb-3">
                {insights.chunks_failed} of {insights.chunks_attempted} analysis batches failed.
              </p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {regenerating ? "Retrying..." : "Retry Insights Generation"}
              </button>
            </div>
          ) : insights ? (
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

      {/* Respondent Summaries — collapsed at bottom */}
      {completedSessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <button
            onClick={() => setShowSummaries(!showSummaries)}
            className="w-full flex items-center justify-between"
          >
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Respondent Summaries ({completedSessions.length})
            </p>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showSummaries ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSummaries && (
            <div className="mt-4 space-y-4">
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
          )}
        </div>
      )}
    </div>
  );
}
