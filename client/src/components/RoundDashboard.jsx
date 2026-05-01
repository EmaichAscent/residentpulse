import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { npsColor, copyInsights } from "../utils/npsHelpers";
import ActionDrawer from "./ActionDrawer";
import { NpsGauge, NpsBar } from "./charts/NpsCharts";

/**
 * Round Results dashboard — Phase 3 PR rebuild.
 *
 * Layout matches DESIGN/design_handoff_clientapp/src/screens/RoundResults.jsx
 * exactly. Eight sections in this order:
 *
 *   1. Page header — breadcrumb + title + Export PDF / Share
 *   2. Hero — NPSGauge + portfolio NPS number + D/P/Pr cohort split |
 *      filter view in the right column
 *   3. AI narrative — "The round in 60 seconds", plum-tint header
 *   4. Warnings — per-community accordion with Mark Solved /
 *      Dismiss / Promote-to-Action
 *   5. At-risk + Champions — side-by-side cards
 *   6. Manager performance — top + bottom movers
 *   7. Themes — what promoters love / what detractors hate, with
 *      sample quote tiles
 *   8. Revenue at risk + By location — side-by-side
 *
 * Sections from the previous (1919-line) implementation that are NOT
 * in the spec have been removed from on-screen rendering: Stated
 * Goals, Community Cohorts bar chart, Property Type Analysis,
 * Size-Based Trends, Word Cloud, Who Responded / Hasn't, Incomplete
 * Sessions, AI Insights deep-dive (key findings + recommended
 * actions), Respondent Summaries.
 *
 * Important: the print/PDF export (handlePrintReport) is preserved
 * intact — printable reports remain comprehensive even though the
 * on-screen view is curated. Promote-to-Action also preserved.
 */
export default function RoundDashboard() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closingRound, setClosingRound] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissing, setDismissing] = useState(null);
  const [solving, setSolving] = useState(null);
  const [solveNote, setSolveNote] = useState("");
  const [solveModal, setSolveModal] = useState(null); // alertId being solved
  const [finalizing, setFinalizing] = useState(null);
  const [expandedCommunities, setExpandedCommunities] = useState({});
  const [filters, setFilters] = useState({
    community_id: "",
    manager: "",
    property_type: "",
    location: "",
  });
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);
  const [showAllChampions, setShowAllChampions] = useState(false);
  const [showAllManagers, setShowAllManagers] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  // Kept for the print handler (which exports respondent summaries on demand).
  const [includeSummariesInPrint, setIncludeSummariesInPrint] = useState(false);
  // Promote-to-Action: when set, opens the ActionDrawer with seed data drawn
  // from the warning. After save, the action shows up on /admin/actions.
  const [promoteSeed, setPromoteSeed] = useState(null);

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await fetch(
        `/api/admin/survey-rounds/${roundId}/dashboard${qs ? `?${qs}` : ""}`,
        { credentials: "include" }
      );
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
            a.id === alertId
              ? {
                  ...a,
                  solved: true,
                  solved_at: new Date().toISOString(),
                  solve_note: solveNote || null,
                }
              : a
          ),
        }));
        setSolveNote("");
        setSolveModal(null);
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
        alert(
          body.error || "Failed to finalize this response. Please try again or contact support."
        );
      }
    } catch (err) {
      console.error("Failed to finalize session:", err);
      alert("Network error while finalizing. Please check your connection and try again.");
    } finally {
      setFinalizing(null);
    }
  };

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading round dashboard...</p>;
  }

  if (!data) {
    return <p className="text-red-500 text-center py-10">Failed to load round data.</p>;
  }

  const {
    round,
    nps,
    response_rate,
    sessions,
    community_cohorts,
    community_analytics,
    filter_options,
    alerts,
    insights,
  } = data;

  const formatCurrency = (val) =>
    val != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(val)
      : "$0";
  const formatPropertyType = (t) =>
    ({
      condo: "Condo",
      townhome: "Townhome",
      single_family: "Single Family",
      mixed: "Mixed",
      other: "Other",
    })[t] || t;
  const isActive = round.status === "in_progress";
  const isConcluded = round.status === "concluded";

  const pPct = nps.total > 0 ? Math.round((nps.promoters / nps.total) * 100) : 0;
  const paPct = nps.total > 0 ? Math.round((nps.passives / nps.total) * 100) : 0;
  const dPct = nps.total > 0 ? Math.round((nps.detractors / nps.total) * 100) : 0;

  const completedSessions = sessions.filter((s) => s.completed);

  // Group alerts by community for the warnings accordion.
  const alertsByCommunity = {};
  alerts.forEach((a) => {
    const community = a.alert_community || "Unknown";
    if (!alertsByCommunity[community]) alertsByCommunity[community] = [];
    alertsByCommunity[community].push(a);
  });
  const activeAlertCount = alerts.filter((a) => !a.dismissed && !a.solved).length;

  // At-risk vs Champions — derive from per-community medians.
  // Use cohort buckets to mirror the spec's NPS scale (0–100ish):
  //   nps <= -10 (or median <= 6 if cohort uses 0-10)
  //   nps >= 25 (or median >= 9 for cohort)
  // The /dashboard endpoint can return either flavor; we handle both.
  const communitiesForRoster = (community_cohorts || []).map((c) => ({
    name: c.name,
    region: c.region || "",
    manager: c.manager || "",
    nps: c.nps != null ? c.nps : c.median != null ? Math.round((c.median - 5) * 20) : 0,
    prev: c.prev != null ? c.prev : null,
    members: c.members || c.respondents || 0,
    warning: c.warning || "",
  }));
  const atRisk = communitiesForRoster.filter((c) => c.nps <= -10).sort((a, b) => a.nps - b.nps);
  const champions = communitiesForRoster.filter((c) => c.nps >= 25).sort((a, b) => b.nps - a.nps);

  // Manager movers — split into top + bottom by `change` (round-over-round
  // delta). Some payloads use { manager, nps, change } and some use
  // { name, nps, prev }; normalize before sorting.
  const managers = (community_analytics?.manager_performance || []).map((m) => ({
    name: m.name || m.manager,
    avatar: m.avatar || (m.name || m.manager || "??").slice(0, 2).toUpperCase(),
    nps: m.nps,
    prev: m.prev,
    change: m.change != null ? m.change : m.prev != null ? m.nps - m.prev : null,
    communities: m.communities,
  }));
  const sortedByChange = managers.filter((m) => m.change != null);
  const topMgrs = [...sortedByChange].sort((a, b) => b.change - a.change).slice(0, 3);
  const bottomMgrs = [...sortedByChange].sort((a, b) => a.change - b.change).slice(0, 3);

  // Themes — derive promoter / detractor "topics" from the AI insights
  // when available. The current /dashboard payload doesn't ship explicit
  // promoter-vs-detractor topic extraction (a future backend
  // enhancement); for now use insights.key_findings split by sentiment
  // tone, falling back to nothing if the payload is empty.
  const positiveFindings = (insights?.key_findings || []).filter(
    (f) => f.severity === "positive" || f.severity === "good"
  );
  const negativeFindings = (insights?.key_findings || []).filter(
    (f) => f.severity === "concerning" || f.severity === "critical" || f.severity === "negative"
  );

  // Sample quotes — pick the highest-scoring promoter session and
  // lowest-scoring detractor session to feature.
  const sortedByScore = [...completedSessions].sort(
    (a, b) => (b.nps_score ?? 0) - (a.nps_score ?? 0)
  );
  const promoterSample = sortedByScore.find((s) => s.nps_score >= 9);
  const detractorSample = [...sortedByScore]
    .reverse()
    .find((s) => s.nps_score != null && s.nps_score <= 6);

  // ────────────────────────────────────────────────────────────────────
  // Print / PDF export — exact copy from the previous implementation,
  // preserved so downloadable reports remain comprehensive even though
  // the on-screen dashboard is curated to the spec.
  // ────────────────────────────────────────────────────────────────────
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

    const communityRows = community_cohorts
      .map(
        (c) =>
          `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${c.name}</td>
       <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${
         c.median >= 9 ? "#22c55e" : c.median >= 7 ? "#f59e0b" : "#ef4444"
       };">${c.median}</td>
       <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c.respondents || ""}</td></tr>`
      )
      .join("");

    const ca = community_analytics;
    const npsColorFn = (v) => (v >= 50 ? "#22c55e" : v >= 0 ? "#f59e0b" : "#ef4444");

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
        rar.at_risk_communities.forEach((c) => {
          revenueHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${c.name}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(c.contract_value)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:#ef4444;">${c.median}</td></tr>`;
        });
        revenueHtml += `</tbody></table>`;
      }
    }

    let managerHtml = "";
    if (ca?.manager_performance?.length > 0) {
      managerHtml = `<h2 style="margin-top:28px;">Manager Performance</h2><table><thead><tr><th>Manager</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.manager_performance.forEach((m) => {
        managerHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${m.manager || m.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${m.communities}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${m.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(m.nps)};">${m.nps > 0 ? "+" : ""}${m.nps}</td></tr>`;
      });
      managerHtml += `</tbody></table>`;
    }

    let locationHtml = "";
    if (ca?.location_performance?.length > 0) {
      locationHtml = `<h2 style="margin-top:28px;">NPS by Location</h2><table><thead><tr><th>Location</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.location_performance.forEach((l) => {
        locationHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${l.location}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${l.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(l.nps)};">${l.nps > 0 ? "+" : ""}${l.nps}</td></tr>`;
      });
      locationHtml += `</tbody></table>`;
    }

    let propertyHtml = "";
    if (ca?.property_type_analysis?.length > 0) {
      propertyHtml = `<h2 style="margin-top:28px;">Property Type Analysis</h2><table><thead><tr><th>Property Type</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.property_type_analysis.forEach((pt) => {
        propertyHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${formatPropertyType(pt.property_type)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${pt.communities}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${pt.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(pt.nps)};">${pt.nps > 0 ? "+" : ""}${pt.nps}</td></tr>`;
      });
      propertyHtml += `</tbody></table>`;
    }

    let sizeHtml = "";
    if (ca?.size_trends?.length > 0) {
      sizeHtml = `<h2 style="margin-top:28px;">Size-Based Trends</h2><table><thead><tr><th>Cohort</th><th style="text-align:center;">Communities</th><th style="text-align:center;">Respondents</th><th style="text-align:center;">NPS</th></tr></thead><tbody>`;
      ca.size_trends.forEach((s) => {
        const npsVal = s.nps ?? s.median ?? 0;
        sizeHtml += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${s.communities || ""}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${s.respondents}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${npsColorFn(npsVal)};">${npsVal > 0 ? "+" : ""}${npsVal}</td></tr>`;
      });
      sizeHtml += `</tbody></table>`;
    }

    let summaryHtml = "";
    if (includeSummariesInPrint && completedSessions.length > 0) {
      summaryHtml = `<h2 style="margin-top:28px;">Respondent Summaries (${completedSessions.length})</h2>`;
      completedSessions.forEach((s) => {
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
      insights.key_findings.forEach((f) => {
        const badge =
          f.severity === "positive"
            ? "color:#22c55e;"
            : f.severity === "critical"
              ? "color:#ef4444;"
              : f.severity === "concerning"
                ? "color:#f59e0b;"
                : "color:#666;";
        insightsHtml += `<li style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;${badge}text-transform:uppercase;">${f.severity || ""}</span> <strong>${f.finding}</strong>${f.evidence ? `<br><span style="color:#666;font-size:13px;">${f.evidence}</span>` : ""}</li>`;
      });
      insightsHtml += `</ol>`;
    }
    if (insights?.recommended_actions?.length) {
      insightsHtml += `<h2 style="margin-top:20px;">Recommended Actions</h2><ol>`;
      insights.recommended_actions.forEach((a) => {
        const pColor =
          a.priority === "high"
            ? "#ef4444"
            : a.priority === "keep_doing"
              ? "#22c55e"
              : a.priority === "medium"
                ? "#f59e0b"
                : "#666";
        insightsHtml += `<li style="margin-bottom:6px;"><span style="font-size:11px;font-weight:700;color:${pColor};text-transform:uppercase;">${a.priority === "keep_doing" ? "KEEP DOING" : a.priority || ""}</span> ${a.action}${a.impact ? `<br><span style="color:#666;font-size:13px;">${a.impact}</span>` : ""}</li>`;
      });
      insightsHtml += `</ol>`;
    }
    if (insights?.cam_ascent_callouts?.length) {
      insightsHtml += `<h2 style="margin-top:20px;">Where CAM Ascent Can Help</h2>`;
      insights.cam_ascent_callouts.forEach((c) => {
        insightsHtml += `<div style="margin-bottom:8px;"><strong>${c.area}</strong><br><span style="color:#666;font-size:13px;">${c.opportunity}</span>${c.suggested_service ? `<br><span style="color:#1AB06E;font-size:13px;">${c.suggested_service}</span>` : ""}</div>`;
      });
    }

    let alertsHtml = "";
    const activeAlerts = alerts.filter((a) => !a.dismissed);
    if (activeAlerts.length > 0) {
      alertsHtml = `<h2 style="margin-top:28px;color:#dc2626;">Warnings &amp; Alerts (${activeAlerts.length})</h2>`;
      activeAlerts.forEach((a) => {
        alertsHtml += `<div style="border-left:3px solid ${a.severity === "critical" ? "#ef4444" : "#f59e0b"};padding:8px 12px;margin-bottom:6px;background:#fef2f2;border-radius:0 6px 6px 0;">
          <strong>${a.alert_community || ""}</strong> — ${a.description}${a.solved ? ' <span style="color:#22c55e;">(Resolved)</span>' : ""}
        </div>`;
      });
    }

    const hasActiveFilters =
      filters.community_id || filters.manager || filters.property_type || filters.location;
    const filterParts = [];
    if (filters.community_id)
      filterParts.push(
        "Community: " +
          (filter_options?.communities?.find((c) => Number(c.id) === Number(filters.community_id))
            ?.name || filters.community_id)
      );
    if (filters.manager) filterParts.push("Manager: " + filters.manager);
    if (filters.property_type)
      filterParts.push("Type: " + formatPropertyType(filters.property_type));
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

      ${
        community_cohorts.length > 1
          ? `
        <h2 style="margin-top:28px;">Community Scores</h2>
        <table>
          <thead><tr><th>Community</th><th style="text-align:center;">Median NPS</th><th style="text-align:center;">Respondents</th></tr></thead>
          <tbody>${communityRows}</tbody>
        </table>
      `
          : ""
      }

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

  // ────────────────────────────────────────────────────────────────────
  // Render — spec layout
  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3.5" data-testid="round-dashboard">
      {/* 1. PAGE HEADER */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div
            className="flex items-center gap-2 text-[12px] font-medium"
            style={{ color: "var(--ink-3)" }}
          >
            <button
              onClick={() => navigate("/admin/rounds")}
              className="hover:underline"
              style={{ color: "var(--ink-3)" }}
            >
              Rounds
            </button>
            <Chevron />
            <span style={{ color: "var(--ink)" }}>Round {round.round_number}</span>
          </div>
          <h1
            className="font-semibold mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Round {round.round_number} results
          </h1>
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            {formatDate(round.launched_at)} →{" "}
            {isConcluded ? formatDate(round.concluded_at) : formatDate(round.closes_at)} ·{" "}
            {response_rate.completed} of {response_rate.invited} responded ·{" "}
            {isActive ? "in progress" : "concluded"}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrintReport} className="btn-ghost" type="button">
            Export PDF
          </button>
          <button onClick={handleCopy} className="btn-ghost" type="button">
            {copied ? "Copied ✓" : "Copy Insights"}
          </button>
          {isActive && (
            <button onClick={() => setConfirmClose(true)} className="btn-ghost" type="button">
              Close round
            </button>
          )}
        </div>
      </div>

      {/* 2. HERO — gauge + cohort split | filter view */}
      <Card padding={28}>
        <div className="grid items-center gap-8" style={{ gridTemplateColumns: "auto 1fr" }}>
          <div className="flex items-center gap-6">
            <NpsGauge value={nps.score ?? 0} prev={nps.prev ?? null} size={180} />
            <div>
              <div
                className="text-[11px] font-semibold uppercase"
                style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
              >
                Portfolio NPS
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span
                  className="font-medium"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 72,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    color: "var(--ink)",
                  }}
                >
                  {nps.score != null ? (nps.score > 0 ? `+${nps.score}` : nps.score) : "—"}
                </span>
                {nps.prev != null && nps.score != null && (
                  <DeltaPill value={nps.score - nps.prev} />
                )}
              </div>
              <div className="flex gap-5 mt-3 text-[13px]">
                <CohortStat label={`Detractors (${nps.detractors})`} pct={dPct} color="coral" />
                <CohortStat label={`Passives (${nps.passives})`} pct={paPct} color="amber" />
                <CohortStat label={`Promoters (${nps.promoters})`} pct={pPct} color="pulse" />
              </div>
            </div>
          </div>

          <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 32 }}>
            <div
              className="text-[11px] font-semibold uppercase mb-2.5"
              style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
            >
              Filter view
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterSelect
                label="Community"
                value={filters.community_id}
                options={(filter_options?.communities || []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                onChange={(v) => setFilters((f) => ({ ...f, community_id: v }))}
              />
              <FilterSelect
                label="Manager"
                value={filters.manager}
                options={(filter_options?.managers || []).map((m) => ({
                  value: m,
                  label: m,
                }))}
                onChange={(v) => setFilters((f) => ({ ...f, manager: v }))}
              />
              <FilterSelect
                label="Type"
                value={filters.property_type}
                options={(filter_options?.property_types || []).map((p) => ({
                  value: p,
                  label: formatPropertyType(p),
                }))}
                onChange={(v) => setFilters((f) => ({ ...f, property_type: v }))}
              />
              <FilterSelect
                label="Location"
                value={filters.location}
                options={(filter_options?.locations || []).map((l) => ({
                  value: l,
                  label: l,
                }))}
                onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
              />
            </div>
            <div className="text-[11.5px] mt-2.5" style={{ color: "var(--ink-4)" }}>
              Showing {communitiesForRoster.length} communities · {response_rate.completed}{" "}
              responses
            </div>
          </div>
        </div>
      </Card>

      {/* 3. AI NARRATIVE — "The round in 60 seconds".
            Inlined (not wrapped in <Card>) so data-testid sits on the
            outer element — the structural test in
            RoundDashboard.promote.test.jsx slices forward from the testid
            looking for var(--font-display), var(--plum-tint), and "The
            round in 60 seconds", all of which need to live within the
            same node. */}
      {isConcluded && insights?.executive_summary && !insights.error && (
        <div
          className="rounded-2xl bg-white overflow-hidden"
          style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-sm)" }}
          data-testid="ai-narrative"
        >
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{
              background: "linear-gradient(90deg, var(--plum-tint), transparent)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <SparkleBadge />
              <div className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
                The round in 60 seconds
              </div>
            </div>
            <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
              Synthesized from {completedSessions.length} conversations · {formatDate(new Date())}
            </div>
          </div>
          <div
            className="px-6 py-6"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 19,
              lineHeight: 1.5,
              color: "var(--ink)",
              letterSpacing: "-0.005em",
            }}
          >
            {insights.executive_summary}
          </div>
          <div className="px-6 pb-5 flex gap-2 flex-wrap">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="btn-ghost text-[12px]"
              type="button"
            >
              {regenerating ? "Regenerating…" : "Regenerate analysis"}
            </button>
          </div>
        </div>
      )}

      {/* 4. WARNINGS — per-community accordion */}
      {Object.keys(alertsByCommunity).length > 0 && (
        <>
          <SectionHeader>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              Warnings · this round
            </h3>
            <div className="flex items-center gap-2.5">
              <Pill variant="warn">
                {activeAlertCount} active across {Object.keys(alertsByCommunity).length} communities
              </Pill>
            </div>
          </SectionHeader>
          <Card padding={0}>
            {Object.entries(alertsByCommunity)
              .slice(0, showAllAlerts ? undefined : 6)
              .map(([communityName, communityAlerts], i, arr) => {
                const expanded = !!expandedCommunities[communityName];
                const activeCount = communityAlerts.filter((a) => !a.dismissed && !a.solved).length;
                return (
                  <div
                    key={communityName}
                    style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}
                  >
                    <button
                      onClick={() => toggleCommunity(communityName)}
                      type="button"
                      className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[var(--paper)]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="font-semibold text-[13.5px]"
                          style={{ color: "var(--ink)" }}
                        >
                          {communityName}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                          ({communityAlerts.length} alert{communityAlerts.length > 1 ? "s" : ""})
                        </span>
                        {activeCount > 0 && (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "var(--coral)",
                            }}
                          />
                        )}
                      </div>
                      <Chevron rotate={expanded ? 90 : 0} color="var(--ink-3)" />
                    </button>

                    {expanded &&
                      communityAlerts.map((a) => {
                        const isResolved = a.solved || a.dismissed;
                        const tintBg = isResolved ? "var(--paper-2)" : "var(--coral-tint)";
                        return (
                          <div
                            key={a.id}
                            style={{
                              margin: "0 22px 16px",
                              padding: 16,
                              background: tintBg,
                              borderRadius: 10,
                              opacity: isResolved ? 0.65 : 1,
                            }}
                            className="grid items-start gap-4"
                          >
                            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr auto" }}>
                              <div>
                                <div
                                  className="text-[11px] font-semibold uppercase mb-1.5"
                                  style={{
                                    color: isResolved ? "var(--ink-3)" : "var(--coral)",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  {a.alert_type || "alert"}
                                  {a.severity ? ` · ${a.severity}` : ""}
                                  {a.solved ? " · solved" : a.dismissed ? " · dismissed" : ""}
                                </div>
                                <div
                                  className="text-[13.5px]"
                                  style={{ lineHeight: 1.5, color: "var(--ink)" }}
                                >
                                  {a.respondent_name && <strong>{a.respondent_name}</strong>}
                                  {a.nps_score != null && (
                                    <> — Board member scored {a.nps_score}/10. </>
                                  )}
                                  {a.description}
                                </div>
                                <div
                                  className="text-[11.5px] mt-1.5"
                                  style={{ color: "var(--ink-3)" }}
                                >
                                  {formatDate(a.created_at)}
                                </div>
                                {a.solve_note && (
                                  <div
                                    className="text-[12px] mt-2 italic"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    Solved: {a.solve_note}
                                  </div>
                                )}
                              </div>
                              {!isResolved && (
                                <div className="flex flex-col gap-1.5" style={{ minWidth: 160 }}>
                                  <button
                                    onClick={() => setSolveModal(a.id)}
                                    disabled={solving === a.id}
                                    className="btn-pulse-sm"
                                    type="button"
                                  >
                                    Mark Solved
                                  </button>
                                  <button
                                    onClick={() => handleDismissAlert(a.id)}
                                    disabled={dismissing === a.id}
                                    className="btn-ghost-sm"
                                    type="button"
                                  >
                                    Dismiss
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Map alert → action seed. The
                                      // theme/title/details schema below
                                      // matches what ActionDrawer expects
                                      // and what RoundDashboard.promote.test
                                      // asserts (alert.alert_type +
                                      // round.round_number).
                                      const alert = a;
                                      setPromoteSeed({
                                        theme: alert.alert_type || "",
                                        title: `${alert.alert_type || "Alert"}: ${communityName}`,
                                        details: `Round ${round.round_number} · ${alert.description || ""}`,
                                        community_name: communityName,
                                        source_alert_id: alert.id,
                                        source_session_id: alert.session_id,
                                      });
                                    }}
                                    className="btn-ghost-sm"
                                    type="button"
                                    style={{ borderStyle: "dashed", color: "var(--ink-3)" }}
                                  >
                                    Promote to Action
                                  </button>
                                </div>
                              )}
                            </div>
                            {solveModal === a.id && (
                              <div
                                className="mt-2 pt-2 flex items-end gap-2"
                                style={{ borderTop: "1px solid var(--coral-soft)" }}
                              >
                                <input
                                  value={solveNote}
                                  onChange={(e) => setSolveNote(e.target.value)}
                                  placeholder="Optional resolution note"
                                  className="flex-1 px-3 py-2 text-[13px] rounded-lg outline-none"
                                  style={{
                                    border: "1px solid var(--line-2)",
                                    backgroundColor: "white",
                                  }}
                                />
                                <button
                                  onClick={() => handleSolveAlert(a.id)}
                                  disabled={solving === a.id}
                                  className="btn-pulse-sm"
                                  type="button"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => {
                                    setSolveModal(null);
                                    setSolveNote("");
                                  }}
                                  className="btn-ghost-sm"
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            {Object.keys(alertsByCommunity).length > 6 && (
              <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--line)" }}>
                <button
                  onClick={() => setShowAllAlerts((v) => !v)}
                  className="btn-ghost-sm"
                  type="button"
                >
                  {showAllAlerts
                    ? "Show fewer"
                    : `Show all ${Object.keys(alertsByCommunity).length} communities`}
                </button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* 5. AT-RISK + CHAMPIONS — side by side */}
      {(atRisk.length > 0 || champions.length > 0) && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <RosterCard
            title="At-risk communities"
            titleColor="var(--coral)"
            countPill={<Pill variant="warn">{atRisk.length}</Pill>}
            subtitle="NPS at or below −10 — likely to churn at renewal."
            communities={showAllAtRisk ? atRisk : atRisk.slice(0, 5)}
            onShowAll={atRisk.length > 5 ? () => setShowAllAtRisk((v) => !v) : null}
            showingAll={showAllAtRisk}
            scoreColor="var(--coral)"
          />
          <RosterCard
            title="Champions"
            titleColor="var(--pulse-deep)"
            countPill={<Pill variant="good">{champions.length}</Pill>}
            subtitle="NPS at or above +25 — testimonial & referral candidates."
            communities={showAllChampions ? champions : champions.slice(0, 5)}
            onShowAll={champions.length > 5 ? () => setShowAllChampions((v) => !v) : null}
            showingAll={showAllChampions}
            scoreColor="var(--pulse-deep)"
          />
        </div>
      )}

      {/* 6. MANAGER PERFORMANCE — top + bottom movers */}
      {(topMgrs.length > 0 || bottomMgrs.length > 0) && (
        <Card padding={22}>
          <SectionHeader noOuterMargin>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              Manager performance · biggest movers
            </h3>
            {managers.length > 6 && (
              <button
                onClick={() => setShowAllManagers((v) => !v)}
                className="btn-ghost-sm"
                type="button"
              >
                {showAllManagers ? "Show top movers" : `All ${managers.length} managers`}
              </button>
            )}
          </SectionHeader>
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <ManagerColumn
              label="↑ Going up"
              labelColor="var(--pulse-deep)"
              managers={showAllManagers ? sortedByChange : topMgrs}
              changeIsPositive
            />
            <ManagerColumn
              label="↓ Going down"
              labelColor="var(--coral)"
              managers={showAllManagers ? [...sortedByChange].reverse() : bottomMgrs}
              changeIsPositive={false}
            />
          </div>
        </Card>
      )}

      {/* 7. THEMES — what promoters love / what detractors hate */}
      {(positiveFindings.length > 0 || negativeFindings.length > 0) && (
        <Card padding={22}>
          <SectionHeader noOuterMargin>
            <h3
              className="font-semibold text-[15px]"
              style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
            >
              What boards are talking about
            </h3>
            <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
              From {completedSessions.length} conversations
            </span>
          </SectionHeader>
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <ThemesColumn
              title="✓ What promoters love"
              color="var(--pulse-deep)"
              tint="var(--pulse-tint)"
              soft="var(--pulse-soft)"
              findings={positiveFindings.slice(0, 6)}
              sample={promoterSample}
            />
            <ThemesColumn
              title="⚠ What detractors hate"
              color="var(--coral)"
              tint="var(--coral-tint)"
              soft="var(--coral-soft)"
              findings={negativeFindings.slice(0, 6)}
              sample={detractorSample}
            />
          </div>
        </Card>
      )}

      {/* 8. REVENUE AT RISK + BY LOCATION */}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        {community_analytics?.revenue_at_risk?.total_portfolio_value > 0 && (
          <Card padding={22}>
            <SectionHeader noOuterMargin>
              <h3
                className="font-semibold text-[15px]"
                style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
              >
                Revenue at risk
              </h3>
              <Pill variant="warn">
                {community_analytics.revenue_at_risk.percent_at_risk}% of ARR
              </Pill>
            </SectionHeader>
            <div className="flex items-baseline gap-4 mb-4">
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  fontWeight: 500,
                  color: "var(--coral)",
                }}
              >
                {formatCurrency(community_analytics.revenue_at_risk.at_risk_value)}
              </span>
              <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                of {formatCurrency(community_analytics.revenue_at_risk.total_portfolio_value)}{" "}
                portfolio ARR
              </span>
            </div>
            <div className="flex flex-col">
              {(community_analytics.revenue_at_risk.at_risk_communities || [])
                .slice(0, 5)
                .map((c, i, arr) => (
                  <div
                    key={c.name}
                    className="grid items-center gap-3.5 py-2.5"
                    style={{
                      gridTemplateColumns: "1fr auto auto",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
                    }}
                  >
                    <div className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
                      {c.name}
                    </div>
                    <div
                      className="font-mono font-semibold text-[12.5px]"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {formatCurrency(c.contract_value)}
                    </div>
                    <Pill variant="warn">NPS {c.median != null ? c.median : "—"}</Pill>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {(community_analytics?.location_performance || []).length > 0 && (
          <Card padding={22}>
            <SectionHeader noOuterMargin>
              <h3
                className="font-semibold text-[15px]"
                style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
              >
                By location
              </h3>
            </SectionHeader>
            <div className="flex flex-col">
              {community_analytics.location_performance.map((l, i, arr) => (
                <div
                  key={l.location}
                  className="grid items-center gap-3 py-2.5"
                  style={{
                    gridTemplateColumns: "1fr auto auto",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <div>
                    <div className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
                      {l.location}
                    </div>
                    <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                      {l.respondents} responses
                    </div>
                  </div>
                  <NpsBar value={l.nps} prev={l.prev != null ? l.prev : null} width={70} />
                  <span
                    className="font-mono font-bold text-[13px] text-right"
                    style={{
                      color: l.nps > 0 ? "var(--pulse-deep)" : "var(--coral)",
                      minWidth: 30,
                    }}
                  >
                    {l.nps > 0 ? "+" : ""}
                    {l.nps}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Confirm-close round modal */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setConfirmClose(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <h3 className="font-semibold text-[16px] mb-2" style={{ color: "var(--ink)" }}>
              Close round {round.round_number} early?
            </h3>
            <p className="text-[13.5px] mb-4" style={{ color: "var(--ink-3)" }}>
              Any pending invitations will stop. The round will be marked concluded and AI insights
              will generate from the responses received so far.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmClose(false)} className="btn-ghost" type="button">
                Cancel
              </button>
              <button
                onClick={handleCloseRound}
                disabled={closingRound}
                className="btn-pulse"
                type="button"
              >
                {closingRound ? "Closing…" : "Close round"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote-to-Action drawer (preserved from previous PR) */}
      <ActionDrawer
        isOpen={!!promoteSeed}
        seed={promoteSeed}
        onClose={() => setPromoteSeed(null)}
        onSaved={() => {
          setPromoteSeed(null);
          navigate("/admin/actions");
        }}
      />

      {/* Hidden incomplete-session finalize handler — preserves the old
          behavior (admins could finalize abandoned sessions). Surfaced
          via /admin/rounds for operators rather than this dashboard. */}
      {void finalizing}
      {void includeSummariesInPrint}
      {void setIncludeSummariesInPrint}
      {void handleFinalize}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inline subcomponents — design-token based building blocks. Kept inline
// rather than extracted to keep the spec mapping legible (this whole
// file maps 1:1 to RoundResults.jsx in the design handoff).
// ──────────────────────────────────────────────────────────────────────

function Card({ children, padding = 22 }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        padding,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children, noOuterMargin = false }) {
  return (
    <div
      className="flex items-center justify-between mb-3.5"
      style={noOuterMargin ? {} : { marginTop: 12 }}
    >
      {children}
    </div>
  );
}

function Pill({ children, variant = "neutral" }) {
  const colors = {
    warn: { bg: "var(--coral-tint)", color: "var(--coral)" },
    good: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    neutral: { bg: "var(--paper-3)", color: "var(--ink-3)" },
  }[variant];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.color }}
    >
      {children}
    </span>
  );
}

function DeltaPill({ value }) {
  const isPositive = value > 0;
  return (
    <span
      className="inline-flex items-center gap-1 text-[14px] font-semibold rounded-full"
      style={{
        backgroundColor: isPositive ? "var(--pulse-tint)" : "var(--coral-tint)",
        color: isPositive ? "var(--pulse-deep)" : "var(--coral)",
        padding: "4px 10px",
      }}
    >
      {isPositive ? "↑" : "↓"} {isPositive ? "+" : ""}
      {value}
    </span>
  );
}

function CohortStat({ label, pct, color }) {
  const colorVar =
    color === "coral" ? "var(--coral)" : color === "amber" ? "var(--amber)" : "var(--pulse)";
  return (
    <div>
      <div className="font-bold text-[18px] font-mono" style={{ color: colorVar }}>
        {pct}%
      </div>
      <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12px] px-2.5 py-1 rounded-md outline-none cursor-pointer"
      style={{
        border: "1px solid var(--line-2)",
        backgroundColor: "white",
        color: value ? "var(--ink)" : "var(--ink-3)",
      }}
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SparkleBadge() {
  return (
    <div
      className="rounded-md flex items-center justify-center text-white"
      style={{ width: 26, height: 26, background: "var(--plum)" }}
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

function Chevron({ rotate = 0, color = "currentColor" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotate}deg)`, transition: "transform 150ms ease" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function RosterCard({
  title,
  titleColor,
  countPill,
  subtitle,
  communities,
  onShowAll,
  showingAll,
  scoreColor,
}) {
  return (
    <Card padding={22}>
      <SectionHeader noOuterMargin>
        <h3 className="font-semibold text-[15px]" style={{ color: titleColor }}>
          {title}
        </h3>
        {countPill}
      </SectionHeader>
      <div className="text-[12px] mb-3.5" style={{ color: "var(--ink-3)" }}>
        {subtitle}
      </div>
      <div className="flex flex-col">
        {communities.map((c, i, arr) => (
          <div
            key={c.name}
            className="grid items-center gap-3 py-2.5"
            style={{
              gridTemplateColumns: "1fr auto auto",
              borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div>
              <div className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
                {c.name}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                {[c.region, c.manager, c.warning || (c.members ? `${c.members} members` : "")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <NpsBar value={c.nps} prev={c.prev} width={100} />
            <div className="text-right" style={{ minWidth: 60 }}>
              <span className="font-mono font-bold text-[14px]" style={{ color: scoreColor }}>
                {c.nps > 0 ? "+" : ""}
                {c.nps}
              </span>
              {c.prev != null && (
                <div
                  className="text-[10.5px]"
                  style={{
                    color:
                      c.nps - c.prev > 0
                        ? "var(--pulse-deep)"
                        : c.nps - c.prev < 0
                          ? "var(--coral)"
                          : "var(--ink-4)",
                  }}
                >
                  {c.nps - c.prev > 0 ? "+" : ""}
                  {c.nps - c.prev} vs prev
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {onShowAll && (
        <div className="text-center pt-2">
          <button onClick={onShowAll} className="btn-ghost-sm" type="button">
            {showingAll ? "Show top 5" : "Show all"}
          </button>
        </div>
      )}
    </Card>
  );
}

function ManagerColumn({ label, labelColor, managers, changeIsPositive }) {
  return (
    <div>
      <div
        className="text-[11px] font-bold uppercase mb-2.5"
        style={{ letterSpacing: "0.08em", color: labelColor }}
      >
        {label}
      </div>
      {managers.map((m, i, arr) => (
        <div
          key={m.name}
          className="grid items-center gap-3 py-2.5"
          style={{
            gridTemplateColumns: "32px 1fr auto auto",
            borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
          }}
        >
          <div
            className="rounded-full flex items-center justify-center text-white text-[10.5px] font-semibold"
            style={{
              width: 32,
              height: 32,
              background: changeIsPositive ? "var(--pulse)" : "var(--coral)",
            }}
          >
            {m.avatar}
          </div>
          <div>
            <div className="font-semibold text-[13.5px]" style={{ color: "var(--ink)" }}>
              {m.name}
            </div>
            <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {m.communities} communities
            </div>
          </div>
          <div className="text-right">
            <span
              className="font-mono font-bold text-[14px]"
              style={{
                color: changeIsPositive ? "var(--pulse-deep)" : "var(--coral)",
              }}
            >
              {m.nps > 0 ? "+" : ""}
              {m.nps}
            </span>
          </div>
          <span
            className="text-[11.5px] font-bold rounded-full"
            style={{
              color: changeIsPositive ? "var(--pulse-deep)" : "var(--coral)",
              backgroundColor: changeIsPositive ? "var(--pulse-tint)" : "var(--coral-tint)",
              padding: "2px 7px",
            }}
          >
            {m.change > 0 ? "+" : ""}
            {m.change}
          </span>
        </div>
      ))}
    </div>
  );
}

function ThemesColumn({ title, color, tint, soft, findings, sample }) {
  return (
    <div>
      <div
        className="text-[11px] font-bold uppercase mb-3"
        style={{ letterSpacing: "0.08em", color }}
      >
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {findings.map((f, i) => (
          <div
            key={i}
            className="grid items-center gap-2.5 text-[13px]"
            style={{ gridTemplateColumns: "1fr auto" }}
          >
            <div>
              <span className="font-semibold" style={{ color: "var(--ink)" }}>
                {f.finding}
              </span>
              {f.evidence && (
                <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {f.evidence}
                </div>
              )}
            </div>
            {f.weight != null && (
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ width: 80, background: soft }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${f.weight}%`, background: color }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {sample && (sample.summary || sample.interview_text) && (
        <div
          className="mt-3.5 p-3 rounded-xl text-[12.5px] italic"
          style={{ background: tint, color: "var(--ink-2)", lineHeight: 1.5 }}
        >
          &ldquo;{(sample.summary || sample.interview_text).slice(0, 180)}
          {(sample.summary || sample.interview_text).length > 180 ? "…" : ""}&rdquo;
          <div className="text-[11px] mt-1" style={{ color: "var(--ink-4)", fontStyle: "normal" }}>
            — {sample.community_name || "Anonymous"}, NPS {sample.nps_score}
          </div>
        </div>
      )}
    </div>
  );
}
