import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([loadDashboard(), loadActivity()]).finally(() => setLoading(false));
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/superadmin/dashboard", { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
  };

  const loadActivity = async () => {
    try {
      const res = await fetch("/api/superadmin/activity-log?limit=20", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setActivity(data.entries || []);
      }
    } catch (err) {
      console.error("Activity load error:", err);
    }
  };

  const formatAction = (entry) => {
    const actions = {
      login: "logged in",
      signup: "signed up",
      launch_round: "launched a survey round",
      start_interview: "started an onboarding interview",
      complete_interview: "completed an onboarding interview",
      abandon_interview: "skipped onboarding interview"
    };
    return actions[entry.action] || entry.action;
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading dashboard...</p>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={stats.total_clients} sub={`${stats.active_clients} active`} />
        <StatCard label="Active Rounds" value={stats.active_rounds} />
        <StatCard label="Total Responses" value={stats.total_responses} />
        <StatCard label="Board Members" value={stats.total_members} />
      </div>

      {/* Engagement Warnings */}
      {stats.engagement_warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">
            Engagement Warnings ({stats.engagement_warnings.length})
          </h3>
          <p className="text-xs text-amber-700 mb-3">
            These clients have no admin login in over 30 days or have never logged in.
          </p>
          <div className="space-y-1">
            {stats.engagement_warnings.map((w) => (
              <button
                key={w.id}
                onClick={() => navigate(`/superadmin/clients/${w.id}`)}
                className="block w-full text-left px-3 py-2 text-sm text-amber-900 bg-amber-100/50 rounded-lg hover:bg-amber-100 transition"
              >
                <span className="font-medium">{w.company_name}</span>
                <span className="text-amber-700 ml-2 text-xs">
                  {w.client_code}
                </span>
                <span className="text-amber-600 ml-2 text-xs">
                  {w.last_login ? `Last login: ${new Date(w.last_login).toLocaleDateString()}` : "Never logged in"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {activity.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  entry.actor_type === "superadmin" ? "bg-purple-400" : "bg-blue-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800">{entry.actor_email || "System"}</span>
                  {" "}
                  <span className="text-gray-500">{formatAction(entry)}</span>
                  {entry.company_name && (
                    <span className="text-gray-400"> — {entry.company_name}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
