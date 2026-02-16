import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import SurveySchedule from "./SurveySchedule";

const COLORS = {
  promoter: "#1AB06E",
  passive: "#FBBF24",
  detractor: "#EF4444",
  blue: "#3B9FE7",
  blueDark: "#2B7FC0",
};

// Extract YYYY-MM-DD from datetime strings (handles both "T" and space separators)
const toDateKey = (dt) => (dt || "").split(/[T ]/)[0];

export default function Dashboard({ sessions, user, onNavigate }) {
  const [community, setCommunity] = useState("");
  const [company, setCompany] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [asOfDate, setAsOfDate] = useState("");
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [copied, setCopied] = useState(false);

  // Unique filter values
  const communities = useMemo(
    () => [...new Set(sessions.map((s) => s.community_name).filter(Boolean))].sort(),
    [sessions]
  );
  const companies = useMemo(
    () => [...new Set(sessions.map((s) => s.management_company).filter(Boolean))].sort(),
    [sessions]
  );

  // Filtered sessions
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (community && s.community_name !== community) return false;
      if (company && s.management_company !== company) return false;
      if (asOfDate && toDateKey(s.created_at) > asOfDate) return false;
      return true;
    });
  }, [sessions, community, company, asOfDate]);

  // Sessions with valid NPS scores, grouped by user (latest only)
  const scored = useMemo(() => {
    const validScores = filtered.filter((s) => s.nps_score !== null && s.nps_score !== undefined);

    // Group by email and keep only the latest response per user
    const byUser = {};
    validScores.forEach((s) => {
      const email = s.email;
      if (!byUser[email] || s.created_at > byUser[email].created_at) {
        byUser[email] = s;
      }
    });

    return Object.values(byUser);
  }, [filtered]);

  // NPS calculation
  const nps = useMemo(() => {
    if (scored.length === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };
    const promoters = scored.filter((s) => s.nps_score >= 9).length;
    const passives = scored.filter((s) => s.nps_score >= 7 && s.nps_score <= 8).length;
    const detractors = scored.filter((s) => s.nps_score <= 6).length;
    const score = Math.round(((promoters - detractors) / scored.length) * 100);
    return { score, promoters, passives, detractors, total: scored.length };
  }, [scored]);

  // Stats
  const stats = useMemo(() => {
    const avg = scored.length > 0 ? (scored.reduce((sum, s) => sum + s.nps_score, 0) / scored.length).toFixed(1) : "—";
    const completed = filtered.filter((s) => s.completed).length;
    const rate = filtered.length > 0 ? Math.round((completed / filtered.length) * 100) : 0;
    return { total: filtered.length, avg, completed, rate };
  }, [filtered, scored]);

  // NPS over time (grouped by week) - uses latest response per user as of each week's end
  const overTime = useMemo(() => {
    // Get all valid scored sessions (not just latest per user)
    const allScored = filtered.filter((s) => s.nps_score !== null && s.nps_score !== undefined);

    // Find all weeks that have data
    const weeks = new Set();
    allScored.forEach((s) => {
      const d = new Date(s.created_at.replace(" ", "T"));
      const monday = new Date(d);
      monday.setDate(d.getDate() - d.getDay() + 1);
      const key = monday.toISOString().split(/[T ]/)[0];
      weeks.add(key);
    });

    // For each week, calculate NPS using latest response per user as of that week's end
    return Array.from(weeks)
      .map((weekStart) => {
        const weekEnd = new Date(weekStart + "T00:00:00");
        weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
        const weekEndStr = weekEnd.toISOString().split(/[T ]/)[0];

        // Get latest response per user as of this week's end
        const byUser = {};
        allScored.forEach((s) => {
          if (toDateKey(s.created_at) <= weekEndStr) {
            const email = s.email;
            if (!byUser[email] || s.created_at > byUser[email].created_at) {
              byUser[email] = s;
            }
          }
        });

        const scores = Object.values(byUser).map((s) => s.nps_score);
        const promoters = scores.filter((s) => s >= 9).length;
        const detractors = scores.filter((s) => s <= 6).length;
        const nps = scores.length > 0 ? Math.round(((promoters - detractors) / scores.length) * 100) : 0;
        const label = new Date(weekStart + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

        return { date: weekStart, label, nps, count: scores.length };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // Score distribution (0-10)
  const distribution = useMemo(() => {
    const dist = Array.from({ length: 11 }, (_, i) => ({ score: i, count: 0 }));
    scored.forEach((s) => dist[s.nps_score].count++);
    return dist;
  }, [scored]);

  // Per-user NPS data
  const userScores = useMemo(() => {
    const byUser = {};
    scored.forEach((s) => {
      const key = s.email;
      if (!byUser[key]) byUser[key] = { email: key, scores: [] };
      byUser[key].scores.push({ score: s.nps_score, date: s.created_at });
    });
    return Object.values(byUser)
      .map((u) => {
        u.scores.sort((a, b) => a.date.localeCompare(b.date));
        u.latest = u.scores[u.scores.length - 1].score;
        u.count = u.scores.length;
        u.avg = (u.scores.reduce((sum, s) => sum + s.score, 0) / u.count).toFixed(1);
        return u;
      })
      .sort((a, b) => b.count - a.count);
  }, [scored]);

  // Per-user over time chart data (for selected user — each session is a separate point)
  const userOverTime = useMemo(() => {
    if (!selectedUser) return [];
    const user = userScores.find((u) => u.email === selectedUser);
    if (!user) return [];
    return user.scores.map((s, i) => {
      const d = new Date(s.date.replace(" ", "T"));
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return { label, score: s.score, index: i + 1 };
    });
  }, [userScores, selectedUser]);

  const toggleUser = (email) => {
    setSelectedUser((prev) => (prev === email ? null : email));
  };

  const generateInsights = async () => {
    setLoadingInsights(true);
    setInsights(null);

    try {
      // Get session IDs from scored sessions - only completed ones with summaries
      // (already filtered by community/company/date from dashboard filters)
      const sessionIds = scored
        .filter((s) => s.completed && s.summary && s.summary.trim().length > 0)
        .map((s) => s.id);

      if (sessionIds.length === 0) {
        throw new Error("No completed surveys with summaries found. Users need to complete full surveys before insights can be generated.");
      }

      const res = await fetch("/api/admin/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_ids: sessionIds }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setInsights(data.insights);
    } catch (err) {
      setInsights(`Error: ${err.message}`);
    } finally {
      setLoadingInsights(false);
    }
  };

  const copyInsights = async () => {
    try {
      // Convert markdown to HTML for rich text copy
      const htmlContent = insights
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

      // Create plain text version without markdown
      const plainText = insights.replace(/\*\*/g, '');

      // Copy both HTML and plain text versions
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' })
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback to plain text if rich text copy fails
      try {
        const plainText = insights.replace(/\*\*/g, '');
        await navigator.clipboard.writeText(plainText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Failed to copy:', fallbackErr);
      }
    }
  };

  // Helper to parse inline bold text (**text**)
  const parseBoldText = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const renderInsights = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let currentSection = [];

    lines.forEach((line, index) => {
      // Bold headings (e.g., **Summary:**)
      if (line.match(/^\*\*.*:\*\*$/)) {
        if (currentSection.length > 0) {
          elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(' '))}</p>);
          currentSection = [];
        }
        const heading = line.replace(/\*\*/g, '');
        elements.push(<h3 key={`h-${index}`} className="text-lg font-bold text-gray-900 mt-6 mb-3">{heading}</h3>);
      }
      // Numbered list items
      else if (line.match(/^\d+\.\s/)) {
        if (currentSection.length > 0) {
          elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(' '))}</p>);
          currentSection = [];
        }
        const item = line.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={`li-${index}`} className="flex gap-3 mb-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold flex items-center justify-center">
              {line.match(/^\d+/)[0]}
            </span>
            <p className="text-gray-700 flex-1">{parseBoldText(item)}</p>
          </div>
        );
      }
      // Regular text
      else if (line.trim()) {
        currentSection.push(line);
      }
      // Empty line - flush current section
      else if (currentSection.length > 0) {
        elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(' '))}</p>);
        currentSection = [];
      }
    });

    if (currentSection.length > 0) {
      elements.push(<p key="p-last" className="text-gray-700 mb-4">{parseBoldText(currentSection.join(' '))}</p>);
    }

    return <div>{elements}</div>;
  };

  const barColor = (score) => {
    if (score <= 6) return COLORS.detractor;
    if (score <= 8) return COLORS.passive;
    return COLORS.promoter;
  };

  const npsColor = nps.score >= 50 ? COLORS.promoter : nps.score >= 0 ? COLORS.blue : COLORS.detractor;

  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        {/* Welcome Hero */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-gradient px-8 py-10 text-center">
            <h2 className="text-3xl font-bold text-white mb-2">
              Welcome{user?.company_name ? `, ${user.company_name}` : ""}!
            </h2>
            <p className="text-white/80 text-lg max-w-xl mx-auto">
              You're all set up and ready to start collecting feedback from your board members.
              Here's how to get your first NPS insights in just a few steps.
            </p>
          </div>

          <div className="px-8 py-8">
            {/* Getting Started Steps */}
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: "var(--cam-blue)" }}>
                  1
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Add your board members</h3>
                  <p className="text-gray-500 mb-3">
                    Head over to the Board Members tab and add the people you'd like to survey.
                    You can add them one at a time or import a CSV list —{" "}
                    <button
                      onClick={() => {
                        const csv = `email,first_name,last_name,community_name,management_company\nresident1@example.com,John,Doe,Sunset Gardens,ABC Property Management\nresident2@example.com,Jane,Smith,Oak Hills,ABC Property Management`;
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "sample-users.csv";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="font-semibold underline hover:no-underline"
                      style={{ color: "var(--cam-blue)" }}
                    >
                      download a sample CSV template
                    </button>{" "}
                    to get started quickly.
                  </p>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate("users")}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90 text-white"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      Go to Board Members
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: "var(--cam-blue)" }}>
                  2
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Schedule your survey rounds</h3>
                  <p className="text-gray-500 mb-3">
                    Pick a launch date and we'll set up your survey schedule based on your cadence.
                    When it's time, confirm the launch and all board members get invited automatically.
                  </p>
                  <SurveySchedule />
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: "var(--cam-green)" }}>
                  3
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Watch your dashboard come alive</h3>
                  <p className="text-gray-500">
                    As responses roll in, this dashboard will fill up with your NPS score, trends over time,
                    and AI-powered insights to help you take action. It's all automatic!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Powered by CAM Ascent Analytical Insights */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-8 pt-8 pb-4 flex items-center gap-3">
            <a href="https://camascent.com" target="_blank" rel="noopener noreferrer">
              <img src="/CAMAscent.png" alt="CAM Ascent" className="h-10 object-contain" />
            </a>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--cam-green)" }}>Powered by CAM Ascent Analytical Insights</p>
              <h3 className="text-lg font-semibold text-gray-900">
                AI-driven intelligence built for community association management
              </h3>
            </div>
          </div>
          <div className="px-8 pb-6">
            <p className="text-gray-500 leading-relaxed mb-5">
              ResidentPulse leverages CAM Ascent's analytical engine to transform raw board member feedback
              into clear, actionable intelligence. Our AI doesn't just collect data — it reads between the lines,
              identifies emerging trends, and delivers insights your team can act on immediately. Purpose-built for
              the community association industry, not adapted from generic survey tools.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "var(--cam-blue)", opacity: 0.1 }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">AI-Guided Conversations</h4>
                <p className="text-xs text-gray-500">Intelligent dialogue that adapts to each board member's responses — uncovering what surveys miss.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "var(--cam-green)", opacity: 0.1 }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-green)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Sentiment Analytics</h4>
                <p className="text-xs text-gray-500">CAM Ascent's AI analyzes tone, themes, and satisfaction signals across all your communities at once.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "var(--cam-blue)", opacity: 0.1 }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Actionable Recommendations</h4>
                <p className="text-xs text-gray-500">Get specific, prioritized actions — not just data — so you know exactly what to improve next.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Survey Cadence Best Practices */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--cam-blue)" }}>Best Practices</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            How often should you survey?
          </h3>
          <p className="text-gray-500 leading-relaxed mb-5">
            ResidentPulse is designed for consistent, thoughtful engagement — not survey fatigue.
            We recommend surveying your board members <strong className="text-gray-700">2 to 4 times per year</strong>,
            depending on your community's needs. Here's what works best:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl font-bold" style={{ color: "var(--cam-blue)" }}>2x</span>
                <span className="text-sm font-medium text-gray-500">per year</span>
              </div>
              <p className="text-sm text-gray-500">
                Great for smaller boards or communities just getting started. Survey in the spring and fall
                to capture seasonal shifts in sentiment and track year-over-year progress.
              </p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl font-bold" style={{ color: "var(--cam-green)" }}>4x</span>
                <span className="text-sm font-medium text-gray-500">per year</span>
              </div>
              <p className="text-sm text-gray-500">
                Ideal for active boards that want tighter feedback loops. Quarterly surveys let you
                spot trends early and show board members that their voice drives real change.
              </p>
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-sm text-blue-800">
              <strong>Consistency is key.</strong> Pick a cadence and stick with it — regular surveys build trust
              with your board members and give you reliable trend data over time. You can set your preferred
              cadence in the <button onClick={() => onNavigate && onNavigate("account")} className="font-semibold underline hover:no-underline" style={{ color: "var(--cam-blue)" }}>Account</button> tab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const pPct = nps.total > 0 ? Math.round((nps.promoters / nps.total) * 100) : 0;
  const paPct = nps.total > 0 ? Math.round((nps.passives / nps.total) * 100) : 0;
  const dPct = nps.total > 0 ? Math.round((nps.detractors / nps.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Survey Rounds Timeline */}
      <SurveySchedule />

      {/* Filters */}
      <div className="grid grid-cols-3 gap-4">
        <select
          value={community}
          onChange={(e) => setCommunity(e.target.value)}
          className="input-field"
        >
          <option value="">All Communities</option>
          {communities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="input-field"
        >
          <option value="">All Companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="input-field"
            placeholder="As of date"
          />
          {asOfDate && (
            <p className="text-xs text-gray-500 mt-1">
              Showing NPS as of {new Date(asOfDate + "T00:00:00").toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {scored.length === 0 ? (
        <p className="text-gray-500 text-center py-10 text-lg">No scored responses match the current filters.</p>
      ) : (
        <>
          {/* NPS Score Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Net Promoter Score</p>
            <p className="text-6xl font-bold" style={{ color: npsColor }}>
              {nps.score > 0 ? "+" : ""}{nps.score}
            </p>
            <p className="text-sm text-gray-500 mt-2">Based on {nps.total} user{nps.total !== 1 ? "s" : ""} (latest response per user)</p>
          </div>

          {/* AI Insights — Powered by CAM Ascent */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <a href="https://camascent.com" target="_blank" rel="noopener noreferrer">
                  <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
                </a>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--cam-green)" }}>AI Insights by CAM Ascent Analytics</p>
                  <p className="text-xs text-gray-500 mt-0.5">Actionable recommendations powered by AI analysis of your NPS responses</p>
                </div>
              </div>
              <div className="flex gap-2">
                {insights && (
                  <button
                    onClick={copyInsights}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg transition hover:bg-gray-200"
                  >
                    {copied ? (
                      <>
                        <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={generateInsights}
                  disabled={loadingInsights}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--cam-blue)" }}
                >
                  {loadingInsights ? "Generating..." : insights ? "Refresh Insights" : "Generate Insights"}
                </button>
              </div>
            </div>

            {insights && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
                {renderInsights(insights)}
              </div>
            )}

            {!insights && !loadingInsights && (
              <p className="text-gray-400 text-sm text-center py-4">
                Click "Generate Insights" to get AI-powered actionable recommendations
              </p>
            )}
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Responses", value: stats.total },
              { label: "Avg Score", value: stats.avg },
              { label: "Completed", value: stats.completed },
              { label: "Completion Rate", value: `${stats.rate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* NPS Category Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">NPS Breakdown</p>
            <div className="flex rounded-lg overflow-hidden h-10 text-sm font-semibold text-white">
              {pPct > 0 && (
                <div
                  className="flex items-center justify-center transition-all"
                  style={{ width: `${pPct}%`, backgroundColor: COLORS.promoter }}
                >
                  {pPct}%
                </div>
              )}
              {paPct > 0 && (
                <div
                  className="flex items-center justify-center transition-all text-gray-800"
                  style={{ width: `${paPct}%`, backgroundColor: COLORS.passive }}
                >
                  {paPct}%
                </div>
              )}
              {dPct > 0 && (
                <div
                  className="flex items-center justify-center transition-all"
                  style={{ width: `${dPct}%`, backgroundColor: COLORS.detractor }}
                >
                  {dPct}%
                </div>
              )}
            </div>
            <div className="flex justify-between mt-3 text-sm text-gray-500">
              <span>
                <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: COLORS.promoter }} />
                Promoters ({nps.promoters})
              </span>
              <span>
                <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: COLORS.passive }} />
                Passives ({nps.passives})
              </span>
              <span>
                <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: COLORS.detractor }} />
                Detractors ({nps.detractors})
              </span>
            </div>
          </div>

          {/* NPS Over Time */}
          {overTime.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">NPS Over Time</p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={overTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[-100, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${value > 0 ? "+" : ""}${value}`, "NPS"]}
                    labelFormatter={(label) => `Week of ${label}`}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="nps"
                    stroke={COLORS.blue}
                    strokeWidth={2.5}
                    dot={{ fill: COLORS.blue, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Score Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Score Distribution</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [value, "Responses"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distribution.map((d) => (
                    <Cell key={d.score} fill={barColor(d.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-User NPS */}
          {userScores.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">NPS by User</p>
              <p className="text-xs text-gray-400 mb-3">Click a user to view their score history</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-b">
                      <th className="pb-2 pr-4"></th>
                      <th className="pb-2 pr-4">User</th>
                      <th className="pb-2 pr-4 text-center">Sessions</th>
                      <th className="pb-2 pr-4 text-center">Avg</th>
                      <th className="pb-2 text-center">Latest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {userScores.map((u, i) => {
                      const isSelected = selectedUser === u.email;
                      const color = isSelected ? COLORS.blue : undefined;
                      return (
                        <tr
                          key={u.email}
                          onClick={() => toggleUser(u.email)}
                          className={`cursor-pointer transition ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        >
                          <td className="py-2 pr-4">
                            <div
                              className="w-3 h-3 rounded-full border-2"
                              style={{
                                backgroundColor: isSelected ? color : "transparent",
                                borderColor: isSelected ? color : "#d1d5db",
                              }}
                            />
                          </td>
                          <td className="py-2 pr-4 text-gray-900">{u.email}</td>
                          <td className="py-2 pr-4 text-center text-gray-500">{u.count}</td>
                          <td className="py-2 pr-4 text-center text-gray-700 font-medium">{u.avg}</td>
                          <td className="py-2 text-center">
                            <span className={`font-bold ${u.latest <= 6 ? "text-red-600" : u.latest <= 8 ? "text-yellow-600" : "text-green-600"}`}>
                              {u.latest}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Per-user over time chart */}
              {selectedUser && userOverTime.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Score History — {selectedUser}
                  </p>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={userOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => [value, "NPS Score"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={COLORS.blue}
                        strokeWidth={2.5}
                        dot={{ fill: COLORS.blue, r: 5 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
