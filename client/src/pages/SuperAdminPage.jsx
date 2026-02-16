import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ClientList from "../components/ClientList";
import AddClientModal from "../components/AddClientModal";
import PromptEditor from "../components/PromptEditor";

export default function SuperAdminPage() {
  const [tab, setTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [plans, setPlans] = useState([]);
  const [editPlanId, setEditPlanId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
    loadClients();
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/superadmin/plans", { credentials: "include" });
      if (res.ok) setPlans(await res.json());
    } catch {}
  };

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

  const handleImpersonate = async (client) => {
    if (!confirm(`Impersonate ${client.company_name}? You will be logged in as a client admin for this company.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/superadmin/clients/${client.id}/impersonate`, {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) throw new Error("Impersonation failed");

      // Force full page reload to pick up new session
      window.location.href = "/admin";
    } catch (err) {
      alert("Failed to impersonate client: " + err.message);
    }
  };

  const handleToggleStatus = async (client) => {
    const newStatus = client.status === "active" ? "inactive" : "active";
    const action = newStatus === "active" ? "activate" : "deactivate";

    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${client.company_name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/superadmin/clients/${client.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to update status");

      loadClients();
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleEditClient = async (client) => {
    setEditingClient(client);
    // Load current subscription for this client
    try {
      const res = await fetch(`/api/superadmin/clients/${client.id}/subscription`, { credentials: "include" });
      if (res.ok) {
        const sub = await res.json();
        setEditPlanId(sub?.plan_id || null);
      }
    } catch {
      setEditPlanId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingClient) return;

    try {
      const response = await fetch(`/api/superadmin/clients/${editingClient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: editingClient.company_name,
          address_line1: editingClient.address_line1,
          address_line2: editingClient.address_line2,
          city: editingClient.city,
          state: editingClient.state,
          zip: editingClient.zip,
          phone_number: editingClient.phone_number
        }),
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to update client");

      // Save subscription plan if changed
      if (editPlanId) {
        await fetch(`/api/superadmin/clients/${editingClient.id}/subscription`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: editPlanId }),
          credentials: "include"
        });
      }

      setEditingClient(null);
      setEditPlanId(null);
      loadClients();
    } catch (err) {
      alert("Failed to update client: " + err.message);
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
            onClick={() => setTab("clients")}
            className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
              tab === "clients" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Clients
          </button>
          <button
            onClick={() => setTab("prompt")}
            className={`flex-1 py-3 text-lg font-medium rounded-lg transition ${
              tab === "prompt" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Prompt Editor
          </button>
        </div>

        {/* Content */}
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
              <ClientList
                clients={clients}
                onEdit={handleEditClient}
                onToggleStatus={handleToggleStatus}
                onImpersonate={handleImpersonate}
                onRefresh={loadClients}
              />
            )}
          </div>
        )}

        {tab === "prompt" && <PromptEditor isSuperAdmin={true} />}
      </div>

      {/* Modals */}
      <AddClientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={loadClients}
      />

      {editingClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Edit Client</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={editingClient.company_name}
                onChange={(e) => setEditingClient({ ...editingClient, company_name: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address Line 1
              </label>
              <input
                type="text"
                value={editingClient.address_line1 || ""}
                onChange={(e) => setEditingClient({ ...editingClient, address_line1: e.target.value })}
                className="input-field"
                placeholder="Street address"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address Line 2
              </label>
              <input
                type="text"
                value={editingClient.address_line2 || ""}
                onChange={(e) => setEditingClient({ ...editingClient, address_line2: e.target.value })}
                className="input-field"
                placeholder="Apartment, suite, etc. (optional)"
              />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City
                </label>
                <input
                  type="text"
                  value={editingClient.city || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, city: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State
                </label>
                <input
                  type="text"
                  value={editingClient.state || ""}
                  onChange={(e) => setEditingClient({ ...editingClient, state: e.target.value })}
                  className="input-field"
                  maxLength="2"
                  placeholder="CA"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                value={editingClient.zip || ""}
                onChange={(e) => setEditingClient({ ...editingClient, zip: e.target.value })}
                className="input-field"
                maxLength="10"
                placeholder="12345"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={editingClient.phone_number || ""}
                onChange={(e) => setEditingClient({ ...editingClient, phone_number: e.target.value })}
                className="input-field"
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subscription Plan
              </label>
              <select
                value={editPlanId || ""}
                onChange={(e) => setEditPlanId(Number(e.target.value))}
                className="input-field"
              >
                <option value="">No plan assigned</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.display_name} ({plan.member_limit.toLocaleString()} members, {plan.survey_rounds_per_year} rounds/yr)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setEditingClient(null); setEditPlanId(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="flex-1 btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
