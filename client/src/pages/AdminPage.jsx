import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ResponseList from "../components/ResponseList";
import Dashboard from "../components/Dashboard";
import UserManager from "../components/UserManager";
import AccountSettings from "../components/AccountSettings";

export default function AdminPage() {
  const [tab, setTab] = useState("dashboard");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadSessions();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", { credentials: "include" });
      const data = await response.json();

      if (!data.authenticated || data.user.role !== "client_admin") {
        navigate("/admin/login");
      } else {
        setUser(data.user);
      }
    } catch (err) {
      navigate("/admin/login");
    }
  };

  const loadSessions = () => {
    fetch("/api/admin/responses", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setSessions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      navigate("/admin/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleExitImpersonation = async () => {
    try {
      await fetch("/api/superadmin/exit-impersonation", {
        method: "POST",
        credentials: "include"
      });
      // Force full page reload to pick up restored session
      window.location.href = "/superadmin";
    } catch (err) {
      console.error("Failed to exit impersonation:", err);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.email?.toLowerCase().includes(q) ||
        s.community_name?.toLowerCase().includes(q) ||
        s.management_company?.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Impersonation Banner */}
      {user?.impersonating && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <p className="text-sm text-yellow-800">
              <span className="font-semibold">Viewing as: {user.company_name}</span>
              {" "}(SuperAdmin Impersonation Mode)
            </p>
            <button
              onClick={handleExitImpersonation}
              className="text-sm text-yellow-900 hover:text-yellow-700 font-medium underline"
            >
              Exit Impersonation
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shadow-sm" style={{ backgroundColor: "var(--cam-blue)" }}>
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">ResidentPulse Admin</h1>
            <p className="text-sm text-white/70">{user?.company_name || "Loading..."}</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-white border border-white/40 rounded-lg transition hover:bg-white/10">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab("dashboard")}
          className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
            tab === "dashboard" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setTab("users")}
          className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
            tab === "users" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Board Members
        </button>
        <button
          onClick={() => setTab("responses")}
          className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
            tab === "responses" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Responses
        </button>
        <button
          onClick={() => setTab("account")}
          className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
            tab === "account" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Account
        </button>
      </div>

      {/* Content */}
      {tab === "users" && <UserManager sessions={sessions} />}
      {tab === "dashboard" && (
        loading ? (
          <p className="text-gray-400 text-center py-10">Loading data...</p>
        ) : (
          <Dashboard sessions={sessions} user={user} onNavigate={setTab} />
        )
      )}
      {tab === "responses" && (
        <>
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, community, company, or summary..."
              className="input-field"
            />
          </div>
          {loading ? (
            <p className="text-gray-400 text-center py-10">Loading responses...</p>
          ) : (
            <ResponseList sessions={filtered} onDelete={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))} />
          )}
        </>
      )}
      {tab === "account" && <AccountSettings />}
      </div>
    </div>
  );
}
