import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import AdminUserList from "./AdminUserList";
import AddAdminUserModal from "./AddAdminUserModal";
import ConfirmModal from "./ConfirmModal";

export default function AccountSettings() {
  const [client, setClient] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saveMessage, setSaveMessage] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [cadenceError, setCadenceError] = useState("");
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [subMessage, setSubMessage] = useState(null);
  const [removeAdminTarget, setRemoveAdminTarget] = useState(null);
  const [cadenceConfirm, setCadenceConfirm] = useState(null);
  const { user: sessionUser } = useOutletContext();

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

      setSaveMessage({ type: "success", text: "Account information updated." });
      loadData();
    } catch (err) {
      setSaveMessage({ type: "error", text: "Failed to update account: " + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove user");
      }

      setAdminError("");
      loadData();
    } catch (err) {
      setAdminError(err.message);
    }
  };

  const handleCadenceChange = async (newCadence) => {
    setCadenceConfirm(null);
    const res = await fetch("/api/admin/account/cadence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_cadence: newCadence }),
      credentials: "include"
    });
    if (res.ok) {
      await fetch("/api/admin/survey-rounds/recalculate", {
        method: "POST",
        credentials: "include"
      });
      loadData();
    } else {
      const data = await res.json();
      setCadenceError(data.error);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage(null);

    if (pwForm.newPw.length < 8) {
      setPwMessage({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.newPw }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      setPwMessage({ type: "success", text: "Password changed successfully." });
      setPwForm({ current: "", newPw: "", confirm: "" });
      setTimeout(() => setShowPwModal(false), 1200);
    } catch (err) {
      setPwMessage({ type: "error", text: err.message });
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");
      // Redirect to home after successful deletion
      window.location.href = "/";
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setLogoError("");

    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Only PNG, JPG, and SVG files are accepted.");
      return;
    }
    if (file.size > 500 * 1024) {
      setLogoError("Logo must be under 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Check dimensions for raster images
      if (file.type !== "image/svg+xml") {
        const img = new Image();
        img.onload = () => {
          const ratio = img.width / img.height;
          if (ratio < 0.8) {
            setLogoError("Portrait logos are not supported. Use a landscape or square image.");
            return;
          }
          if (ratio > 3) {
            setLogoError("Logo is too wide. Maximum aspect ratio is 3:1.");
            return;
          }
          uploadLogo(dataUrl, file.type, img.width, img.height);
        };
        img.src = dataUrl;
      } else {
        uploadLogo(dataUrl, file.type);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadLogo = async (dataUrl, mimeType, width, height) => {
    setLogoUploading(true);
    const base64 = dataUrl.split(",")[1];
    try {
      const res = await fetch("/api/admin/account/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_base64: base64, logo_mime_type: mimeType, width, height }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoPreview(dataUrl);
      setClient((prev) => ({ ...prev, has_logo: true }));
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await fetch("/api/admin/account/logo", { method: "DELETE", credentials: "include" });
      setLogoPreview(null);
      setClient((prev) => ({ ...prev, has_logo: false }));
    } catch (err) {
      console.error("Failed to remove logo:", err);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading account information...</p>;
  }

  return (
    <div className="space-y-8">
      {/* Company Information */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Company Information</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="input-field-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="input-field-sm"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Company Logo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Company Logo
            </label>
            <div className="flex items-center gap-4">
              {(logoPreview || client?.has_logo) && (
                <img
                  src={logoPreview || "/api/admin/account/logo"}
                  alt="Company logo"
                  className="h-12 max-w-[200px] object-contain rounded border border-gray-200 bg-white p-1"
                />
              )}
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition text-gray-600">
                  {logoUploading ? "Uploading..." : (client?.has_logo || logoPreview) ? "Replace" : "Upload Logo"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoSelect} disabled={logoUploading} className="hidden" />
                </label>
                {(client?.has_logo || logoPreview) && (
                  <button onClick={handleRemoveLogo} className="text-sm text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
            </div>
            {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, or SVG. Max 500KB. Landscape or square.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Address Line 1
            </label>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              className="input-field-sm"
              placeholder="Street address"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Address Line 2
            </label>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              className="input-field-sm"
              placeholder="Apartment, suite, etc. (optional)"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input-field-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="input-field-sm"
                maxLength="2"
                placeholder="CA"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                ZIP Code
              </label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="input-field-sm"
                maxLength="10"
                placeholder="12345"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Client ID
              </label>
              <p className="text-gray-900 font-mono text-sm">{client?.id}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Status
              </label>
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                  client?.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {client?.status}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Created
              </label>
              <p className="text-gray-900 text-sm">
                {client?.created_at ? new Date(client.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary-sm"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {saveMessage.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowPwModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Current Password</label>
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  className="input-field-sm"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
                <input
                  type="password"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  className="input-field-sm"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  className="input-field-sm"
                  required
                />
              </div>
              {pwMessage && (
                <p className={`text-sm ${pwMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {pwMessage.text}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={pwSaving} className="btn-primary-sm flex-1">
                  {pwSaving ? "Changing..." : "Change Password"}
                </button>
                <button type="button" onClick={() => setShowPwModal(false)} className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Users */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Admin Users</h2>
          <button
            onClick={() => setShowAddUserModal(true)}
            className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
            style={{ backgroundColor: "var(--cam-blue)" }}
          >
            Add Admin User
          </button>
        </div>

        {adminError && (
          <p className="text-sm text-red-600 mb-3">{adminError}</p>
        )}
        <AdminUserList
          users={adminUsers}
          onRemove={(userId) => setRemoveAdminTarget(userId)}
          onUpdate={loadData}
          currentUserEmail={sessionUser?.email}
          onChangePassword={() => { setPwMessage(null); setPwForm({ current: "", newPw: "", confirm: "" }); setShowPwModal(true); }}
        />
      </div>

      {/* Subscription */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Subscription</h2>

        {client?.subscription ? (
          <div className="space-y-4">
            {/* Current Plan */}
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {client.subscription.plan_display_name} Plan
                </p>
                <p className="text-sm text-gray-600">
                  {client.subscription.member_limit.toLocaleString()} board members
                  {" | "}
                  {client.subscription.survey_rounds_per_year} survey rounds/year
                </p>
              </div>
              <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full capitalize ${
                client.subscription.cancel_at_period_end
                  ? "bg-amber-100 text-amber-800"
                  : client.subscription.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}>
                {client.subscription.cancel_at_period_end
                  ? `Cancels${client.subscription.current_period_end ? " " + new Date(client.subscription.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}`
                  : client.subscription.status}
              </span>
            </div>

            {/* Usage */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-500">Board Members</p>
                <p className="text-lg font-bold text-gray-900">
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
                <p className="text-lg font-bold text-gray-900">
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
                    onClick={() => {
                      if ((client.subscription.survey_cadence || 2) !== 2) {
                        setCadenceConfirm(2);
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
                    onClick={() => {
                      if (client.subscription.survey_cadence !== 4) {
                        setCadenceConfirm(4);
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
              {cadenceError && (
                <p className="text-sm text-red-600 mt-2">{cadenceError}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                Changing cadence will recalculate future planned rounds. Already launched rounds are not affected.
              </p>
              {client.subscription.survey_rounds_per_year < 4 && (
                <p className="text-xs text-gray-400 mt-1">
                  Quarterly surveys available on Starter plan and above.
                </p>
              )}
            </div>

            {/* Plan Management */}
            {subMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">{subMessage}</p>
              </div>
            )}

            {client.subscription.cancel_at_period_end ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Cancellation Scheduled</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Your subscription will end{client.subscription.current_period_end
                        ? ` on ${new Date(client.subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                        : " at the end of your billing period"}.
                      You'll be downgraded to the Free plan.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      setSubMessage(null);
                      try {
                        const res = await fetch("/api/admin/account/subscription/reactivate", {
                          method: "POST", credentials: "include",
                          headers: { "Content-Type": "application/json" },
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setSubMessage(data.message);
                          loadData();
                        } else {
                          setSubMessage(data.error);
                        }
                      } catch { setSubMessage("Failed to reactivate. Please try again."); }
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100 transition whitespace-nowrap ml-4"
                  >
                    Undo Cancellation
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setPlanError("");
                    setShowPlanModal(true);
                    const res = await fetch("/api/admin/account/subscription/plans", { credentials: "include" });
                    if (res.ok) setAvailablePlans(await res.json());
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition"
                  style={{ backgroundColor: "var(--cam-blue)" }}
                >
                  Change Plan
                </button>

                {client.subscription.plan_name !== "free" && (
                  <button
                    onClick={() => { setCancelError(""); setShowCancelModal(true); }}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">
            No subscription information available. Contact support for assistance.
          </p>
        )}
      </div>

      {/* Delete Account */}
      <div className="bg-white shadow-md rounded-lg p-6 border border-red-200">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Delete Account</h2>
        <p className="text-sm text-gray-600 mb-3">
          Permanently delete your account and all associated data, including board members,
          survey rounds, responses, and insights. This action cannot be undone.
        </p>
        <button
          onClick={() => { setDeletePassword(""); setDeleteError(""); setShowDeleteModal(true); }}
          className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition"
        >
          Delete Account
        </button>
      </div>

      {/* Change Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowPlanModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Your Plan</h2>
            {planError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{planError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {availablePlans.map((plan) => {
                const isCurrent = client?.subscription?.plan_id === plan.id;
                const isFree = plan.name === "free";
                const price = plan.price_cents ? `$${(plan.price_cents / 100).toLocaleString()}` : null;
                const memberCount = client?.usage?.member_count || 0;
                const wouldExceed = memberCount > plan.member_limit;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    disabled={isCurrent || planLoading}
                    onClick={async () => {
                      setPlanError("");
                      setPlanLoading(true);
                      try {
                        const res = await fetch("/api/admin/account/subscription/change-plan", {
                          method: "POST", credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ plan_id: plan.id }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        if (data.checkout_url) {
                          window.location.href = data.checkout_url;
                        } else {
                          setSubMessage(data.message);
                          setShowPlanModal(false);
                          loadData();
                        }
                      } catch (err) {
                        setPlanError(err.message);
                      } finally {
                        setPlanLoading(false);
                      }
                    }}
                    className={`relative p-4 rounded-xl border-2 text-left transition ${
                      isCurrent
                        ? "border-blue-500 bg-blue-50 cursor-default"
                        : "border-gray-200 hover:border-gray-300"
                    } ${planLoading ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {isCurrent && (
                      <span className="absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500 text-white">
                        Current
                      </span>
                    )}
                    <p className="font-bold text-gray-900">{plan.display_name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Up to {plan.member_limit.toLocaleString()} members
                    </p>
                    <p className="text-sm text-gray-600">
                      {plan.survey_rounds_per_year} rounds/year
                    </p>
                    {isFree ? (
                      <p className="text-xs font-semibold mt-2" style={{ color: "var(--cam-green)" }}>Free Forever</p>
                    ) : (
                      <p className="text-sm font-bold mt-2" style={{ color: "var(--cam-blue)" }}>
                        {price}<span className="text-xs font-normal text-gray-500">/mo</span>
                      </p>
                    )}
                    {wouldExceed && !isCurrent && (
                      <p className="text-xs text-amber-600 mt-2">
                        You have {memberCount} active members. {memberCount - plan.member_limit} will be deactivated.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-red-700 mb-2">Cancel Subscription</h2>
            <p className="text-sm text-gray-600 mb-2">
              Your subscription will remain active until the end of your billing period.
              After that, your account will be downgraded to the <strong>Free plan</strong>:
            </p>
            <ul className="text-sm text-gray-600 mb-4 list-disc pl-5 space-y-1">
              <li>25 board members max</li>
              <li>2 survey rounds per year</li>
              <li>Members over the limit will be deactivated</li>
            </ul>
            {cancelError && (
              <p className="text-sm text-red-600 mb-3">{cancelError}</p>
            )}
            <div className="flex gap-2">
              <button
                disabled={cancelLoading}
                onClick={async () => {
                  setCancelError("");
                  setCancelLoading(true);
                  try {
                    const res = await fetch("/api/admin/account/subscription/cancel", {
                      method: "POST", credentials: "include",
                      headers: { "Content-Type": "application/json" },
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    setSubMessage(data.message);
                    setShowCancelModal(false);
                    loadData();
                  } catch (err) {
                    setCancelError(err.message);
                  } finally {
                    setCancelLoading(false);
                  }
                }}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {cancelLoading ? "Cancelling..." : "Confirm Cancellation"}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Keep Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-red-700 mb-2">Delete Account</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete <strong>{client?.company_name}</strong> and all data.
              Enter your password to confirm.
            </p>
            <form onSubmit={handleDeleteAccount} className="space-y-3">
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="input-field-sm"
                placeholder="Enter your password"
                required
                autoFocus
              />
              {deleteError && (
                <p className="text-sm text-red-600">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddAdminUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAdd={loadData}
      />
      <ConfirmModal
        isOpen={!!removeAdminTarget}
        onClose={() => setRemoveAdminTarget(null)}
        onConfirm={async () => { await handleRemoveUser(removeAdminTarget); setRemoveAdminTarget(null); }}
        title="Remove Admin User"
        message="Are you sure you want to remove this admin user?"
        confirmLabel="Remove"
        destructive
      />
      <ConfirmModal
        isOpen={!!cadenceConfirm}
        onClose={() => setCadenceConfirm(null)}
        onConfirm={() => handleCadenceChange(cadenceConfirm)}
        title="Change Survey Cadence"
        message="Changing your cadence will recalculate future planned rounds. Already launched rounds are not affected. Continue?"
        confirmLabel="Change Cadence"
      />
    </div>
  );
}
