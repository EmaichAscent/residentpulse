import { useState, useEffect } from "react";
import AdminUserList from "./AdminUserList";
import AddAdminUserModal from "./AddAdminUserModal";

export default function AccountSettings() {
  const [client, setClient] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientRes, usersRes] = await Promise.all([
        fetch("/api/admin/account", { credentials: "include" }),
        fetch("/api/admin/users", { credentials: "include" })
      ]);

      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClient(clientData);
        setCompanyName(clientData.company_name);
        setAddressLine1(clientData.address_line1 || "");
        setAddressLine2(clientData.address_line2 || "");
        setCity(clientData.city || "");
        setState(clientData.state || "");
        setZip(clientData.zip || "");
        setPhoneNumber(clientData.phone_number || "");
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setAdminUsers(usersData);
      }
    } catch (err) {
      console.error("Error loading account data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          state,
          zip,
          phone_number: phoneNumber
        }),
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to save");

      alert("Account information updated successfully!");
      loadData();
    } catch (err) {
      alert("Failed to update account: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!confirm("Are you sure you want to remove this admin user?")) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove user");
      }

      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading account information...</p>;
  }

  return (
    <div className="space-y-8">
      {/* Company Information */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Company Information</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address Line 1
            </label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              className="input-field"
              placeholder="Street address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address Line 2
            </label>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="input-field"
              placeholder="Apartment, suite, etc. (optional)"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="input-field"
                maxLength="2"
                placeholder="CA"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ZIP Code
            </label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="input-field"
              maxLength="10"
              placeholder="12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="input-field"
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Client ID
              </label>
              <p className="text-gray-900 font-mono text-sm">{client?.id}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Status
              </label>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  client?.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {client?.status}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Created
            </label>
            <p className="text-gray-900 text-sm">
              {client?.created_at ? new Date(client.created_at).toLocaleDateString() : "—"}
            </p>
          </div>

          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Admin Users */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Admin Users</h2>
          <button
            onClick={() => setShowAddUserModal(true)}
            className="btn-primary"
          >
            Add Admin User
          </button>
        </div>

        <AdminUserList users={adminUsers} onRemove={handleRemoveUser} />
      </div>

      {/* Subscription */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Subscription</h2>

        {client?.subscription ? (
          <div className="space-y-4">
            {/* Current Plan */}
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {client.subscription.plan_display_name} Plan
                </p>
                <p className="text-sm text-gray-600">
                  {client.subscription.member_limit.toLocaleString()} board members
                  {" | "}
                  {client.subscription.survey_rounds_per_year} survey rounds/year
                </p>
              </div>
              <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                {client.subscription.status}
              </span>
            </div>

            {/* Usage */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-500">Board Members</p>
                <p className="text-2xl font-bold text-gray-900">
                  {client.usage?.member_count || 0}
                  <span className="text-sm font-normal text-gray-500">
                    {" / "}{client.subscription.member_limit}
                  </span>
                </p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((client.usage?.member_count || 0) / client.subscription.member_limit) * 100)}%`,
                      backgroundColor: ((client.usage?.member_count || 0) / client.subscription.member_limit) > 0.9
                        ? "#EF4444" : "var(--cam-blue)"
                    }}
                  />
                </div>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-500">Survey Rounds This Year</p>
                <p className="text-2xl font-bold text-gray-900">
                  {client.usage?.survey_rounds_used || 0}
                  <span className="text-sm font-normal text-gray-500">
                    {" / "}{client.subscription.survey_cadence || client.subscription.survey_rounds_per_year}
                  </span>
                </p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((client.usage?.survey_rounds_used || 0) / (client.subscription.survey_cadence || client.subscription.survey_rounds_per_year)) * 100)}%`,
                      backgroundColor: ((client.usage?.survey_rounds_used || 0) / (client.subscription.survey_cadence || client.subscription.survey_rounds_per_year)) > 0.9
                        ? "#EF4444" : "var(--cam-blue)"
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Survey Cadence */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Survey Cadence</p>
                  <p className="text-xs text-gray-500 mt-1">
                    How many times per year you survey your board members
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/admin/account/cadence", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ survey_cadence: 2 }),
                        credentials: "include"
                      });
                      if (res.ok) loadData();
                      else {
                        const data = await res.json();
                        alert(data.error);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      (client.subscription.survey_cadence || 2) === 2
                        ? "text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    style={(client.subscription.survey_cadence || 2) === 2 ? { backgroundColor: "var(--cam-blue)" } : {}}
                  >
                    2x / year
                  </button>
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/admin/account/cadence", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ survey_cadence: 4 }),
                        credentials: "include"
                      });
                      if (res.ok) loadData();
                      else {
                        const data = await res.json();
                        alert(data.error);
                      }
                    }}
                    disabled={client.subscription.survey_rounds_per_year < 4}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      client.subscription.survey_cadence === 4
                        ? "text-white"
                        : client.subscription.survey_rounds_per_year < 4
                        ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    style={client.subscription.survey_cadence === 4 ? { backgroundColor: "var(--cam-blue)" } : {}}
                    title={client.subscription.survey_rounds_per_year < 4 ? "Upgrade your plan to enable quarterly surveys" : ""}
                  >
                    4x / year
                  </button>
                </div>
              </div>
              {client.subscription.survey_rounds_per_year < 4 && (
                <p className="text-xs text-gray-400 mt-2">
                  Quarterly surveys available on Starter plan and above.
                </p>
              )}
            </div>

            {/* Upgrade prompt for free tier */}
            {client.subscription.plan_name === "free" && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-700">
                  Need more capacity? Contact us to upgrade your plan.
                </p>
                <a
                  href="mailto:support@camascent.com"
                  className="text-sm font-semibold hover:underline"
                  style={{ color: "var(--cam-blue)" }}
                >
                  Contact Sales
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">
            No subscription information available. Contact support for assistance.
          </p>
        )}
      </div>

      <AddAdminUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAdd={loadData}
      />
    </div>
  );
}
