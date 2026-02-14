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

      {/* Subscription (Placeholder) */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Subscription</h2>
        <p className="text-gray-500 mb-4">
          Subscription management coming soon. Contact support for billing inquiries.
        </p>
        <div className="inline-block px-4 py-2 bg-gray-100 text-gray-600 rounded-md">
          Billing Portal - Coming Soon
        </div>
      </div>

      <AddAdminUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAdd={loadData}
      />
    </div>
  );
}
