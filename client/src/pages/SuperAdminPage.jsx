import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ClientList from "../components/ClientList";
import AddClientModal from "../components/AddClientModal";
import PromptEditor from "../components/PromptEditor";
import SuperAdminDashboard from "../components/SuperAdminDashboard";

export default function SuperAdminPage() {
  const [tab, setTab] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadClients();
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

  const loadClients = async () => {
    try {
      const response = await fetch("/api/superadmin/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load clients");
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
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
          <button
            onClick={() => setTab("dashboard")}
            className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
              tab === "dashboard" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab("clients")}
            className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
              tab === "clients" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Clients
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
              tab === "settings" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Settings
          </button>
        </div>

        {/* Content */}
        {tab === "dashboard" && <SuperAdminDashboard />}

        {tab === "clients" && (
          <div>
            <div className="mb-4">
              <button onClick={() => setShowAddModal(true)} className="btn-primary">
                Add Client
              </button>
            </div>

            {loading ? (
              <p className="text-gray-400 text-center py-10">Loading clients...</p>
            ) : (
              <ClientList clients={clients} />
            )}
          </div>
        )}

        {tab === "settings" && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Base System Prompt</h2>
              <p className="text-sm text-gray-500">
                This is the global system prompt used when interviewing board members.
                Client-specific supplements from onboarding interviews are appended automatically.
              </p>
            </div>
            <PromptEditor isSuperAdmin={true} />
          </div>
        )}
      </div>

      {/* Modals */}
      <AddClientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={loadClients}
      />
    </div>
  );
}
