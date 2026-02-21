import { useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = location.pathname.replace("/superadmin/", "").split("/")[0] || "dashboard";

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", { credentials: "include" });
      const data = await response.json();

      if (!data.authenticated || data.user.role !== "superadmin") {
        navigate("/superadmin/login");
      }
    } catch (err) {
      navigate("/superadmin/login");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      navigate("/superadmin/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const TABS = [
    { path: "dashboard", label: "Dashboard" },
    { path: "clients", label: "Clients" },
    { path: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="shadow-sm" style={{ backgroundColor: "var(--cam-blue)" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">ResidentPulse SuperAdmin</h1>
            <p className="text-sm text-white/70">Manage all clients and system settings</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-white border border-white/40 rounded-lg transition hover:bg-white/10">
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.path}
              onClick={() => navigate(`/superadmin/${t.path}`)}
              className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
                activeTab === t.path ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Child routes render here */}
        <Outlet />
      </div>
    </div>
  );
}
