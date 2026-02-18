import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.replace("/admin/", "").split("/")[0] || "rounds";

  useEffect(() => {
    checkAuth();
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
      window.location.href = "/superadmin";
    } catch (err) {
      console.error("Failed to exit impersonation:", err);
    }
  };

  const isPaidTier = user?.plan_name && user.plan_name !== "free";

  const TABS = [
    { path: "rounds", label: "Home" },
    { path: "trends", label: "Trends" },
    ...(isPaidTier ? [{ path: "communities", label: "Communities" }] : []),
    { path: "members", label: "Members" },
    { path: "account", label: "Account" },
  ];

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
            <p className="text-lg text-white/90 font-medium">{user?.company_name || "Loading..."}</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-white border border-white/40 rounded-lg transition hover:bg-white/10">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.path}
            onClick={() => navigate(`/admin/${t.path}`)}
            className={`flex-1 py-3 text-sm font-medium rounded-lg transition ${
              activeTab === t.path ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
            style={activeTab === t.path ? { backgroundColor: "var(--cam-green)" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Child routes render here */}
      <Outlet context={{ user, isPaidTier }} />
      </div>
    </div>
  );
}
