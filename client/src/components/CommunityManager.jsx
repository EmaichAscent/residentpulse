import { useState, useEffect } from "react";
import ConfirmModal from "./ConfirmModal";

const PROPERTY_TYPES = [
  { value: "condo", label: "Condo" },
  { value: "townhome", label: "Townhome" },
  { value: "single_family", label: "Single Family" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
];

export default function CommunityManager() {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Import state
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ community_name: "", contract_value: "", community_manager_name: "", property_type: "", number_of_units: "", contract_renewal_date: "", contract_month_to_month: false });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);

  // Deactivation toggle
  const [showDeactivated, setShowDeactivated] = useState(false);

  useEffect(() => {
    fetchCommunities();
  }, []);

  const fetchCommunities = () => {
    setLoading(true);
    fetch("/api/admin/communities")
      .then((r) => r.json())
      .then((data) => setCommunities(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // --- Filter: deactivation + search ---
  const deactivatedCount = communities.filter((c) => c.status === "deactivated").length;
  const visibleCommunities = showDeactivated ? communities : communities.filter((c) => c.status !== "deactivated");
  const filtered = search.trim()
    ? visibleCommunities.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.community_name?.toLowerCase().includes(q) ||
          c.community_manager_name?.toLowerCase().includes(q) ||
          c.property_type?.toLowerCase().includes(q)
        );
      })
    : visibleCommunities;

  // --- Sample CSV ---
  const downloadSampleCSV = () => {
    const csv = `community_name,contract_value,community_manager_name,property_type,number_of_units
Sunset Gardens,48000,Sarah Johnson,condo,150
Oak Ridge HOA,36000,Mike Chen,single_family,85`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-communities.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Manual Add ---
  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.community_name.trim()) {
      setFormError("Community name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommunities((prev) => [...prev, { ...data, member_count: 0 }]);
      setForm({ community_name: "", contract_value: "", community_manager_name: "", property_type: "", number_of_units: "", contract_renewal_date: "", contract_month_to_month: false });
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- CSV Import ---
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setResult(null);
    setPreview(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/communities/import/preview", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data);
      setPreviewFile(file);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  const confirmImport = async () => {
    if (!previewFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", previewFile);

    try {
      const res = await fetch("/api/admin/communities/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setPreview(null);
      setPreviewFile(null);
      fetchCommunities();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  // --- Inline Edit ---
  const startEdit = (c) => {
    setEditingId(c.id);
    setEditForm({
      community_name: c.community_name || "",
      contract_value: c.contract_value || "",
      community_manager_name: c.community_manager_name || "",
      property_type: c.property_type || "",
      number_of_units: c.number_of_units || "",
      contract_renewal_date: c.contract_renewal_date ? c.contract_renewal_date.split("T")[0] : "",
      contract_month_to_month: c.contract_month_to_month || false,
    });
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/communities/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommunities((prev) => prev.map((c) => (c.id === editingId ? { ...data, member_count: c.member_count } : c)));
      setEditingId(null);
    } catch {
      // silently fail
    } finally {
      setEditSaving(false);
    }
  };

  // --- Deactivate / Reactivate toggle ---
  const handleToggleStatus = async (c) => {
    try {
      const res = await fetch(`/api/admin/communities/${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommunities((prev) =>
        prev.map((comm) =>
          comm.id === c.id
            ? { ...comm, status: data.status, deactivated_at: data.status === "deactivated" ? new Date().toISOString() : null }
            : comm
        )
      );
    } catch {
      // silently fail
    } finally {
      setToggleTarget(null);
    }
  };

  const formatCurrency = (val) => {
    if (!val) return "\u2014";
    return "$" + Number(val).toLocaleString();
  };

  const formatPropertyType = (val) => {
    if (!val) return "\u2014";
    return PROPERTY_TYPES.find((t) => t.value === val)?.label || val;
  };

  const formatRenewal = (c) => {
    if (c.contract_month_to_month) return "Month-to-month";
    if (!c.contract_renewal_date) return "\u2014";
    const d = c.contract_renewal_date.split("T")[0];
    const [y, m, day] = d.split("-");
    return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Search Bar with Import and Add Buttons */}
      <div>
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search communities..."
            className="input-field-sm flex-1"
          />
          <a
            href="/api/admin/communities/export"
            download
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg transition hover:bg-gray-50 whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Export
          </a>
          <label
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-lg cursor-pointer transition hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: "var(--cam-blue)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            {uploading ? "Uploading..." : "Import"}
            <input type="file" accept=".csv" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <button
            onClick={() => {
              if (!showForm) setForm({ community_name: "", contract_value: "", community_manager_name: "", property_type: "", number_of_units: "", contract_renewal_date: "", contract_month_to_month: false });
              setShowForm(!showForm);
              setFormError("");
            }}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: "var(--cam-blue)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Community
          </button>
        </div>
        {deactivatedCount > 0 && (
          <label className="flex items-center gap-2 mt-2 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeactivated}
              onChange={(e) => setShowDeactivated(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show deactivated ({deactivatedCount})
          </label>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Import community data to unlock revenue-at-risk analysis, manager performance, and property type insights.{" "}
          <button onClick={downloadSampleCSV} className="font-medium hover:underline" style={{ color: "var(--cam-blue)" }}>
            Download sample CSV
          </button>
        </p>
      </div>

      {/* Import Result */}
      {result && (
        <div className={`p-4 rounded-lg border ${result.error ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          {result.error ? (
            <p className="text-red-700 text-sm">{result.error}</p>
          ) : (
            <div className="text-sm text-green-800">
              <p className="font-semibold">Import complete</p>
              <p>{result.created} created, {result.updated} updated. {result.matched_members > 0 && `${result.matched_members} board member(s) auto-linked.`}</p>
              {result.errors?.length > 0 && (
                <div className="mt-2 text-red-600">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import Preview */}
      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Import Preview</p>

          {preview.matched.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Matched ({preview.matched.length})</p>
              {preview.matched.map((m, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="font-medium">{m.community_name}</span>
                  <span className="text-gray-400">{"\u2014"} {m.member_count} board member{m.member_count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}

          {preview.unmatched.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">No exact match ({preview.unmatched.length})</p>
              {preview.unmatched.map((u, i) => (
                <div key={i} className="py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                    <span className="font-medium">{u.community_name}</span>
                    {u.suggestions.length > 0 ? (
                      <span className="text-gray-400">{"\u2014"} similar: {u.suggestions.map((s) => s.name).join(", ")}</span>
                    ) : (
                      <span className="text-gray-400">{"\u2014"} new community (no board members yet)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview.errors?.length > 0 && (
            <div className="text-xs text-red-600">
              {preview.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={confirmImport}
              disabled={uploading}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--cam-blue)" }}
            >
              {uploading ? "Importing..." : `Import ${preview.matched.length + preview.unmatched.length} Communities`}
            </button>
            <button
              onClick={() => { setPreview(null); setPreviewFile(null); }}
              className="px-5 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Community Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Add New Community</p>
          <form onSubmit={handleAdd} className="space-y-3">
            <input
              type="text"
              value={form.community_name}
              onChange={(e) => setForm({ ...form, community_name: e.target.value })}
              placeholder="Community name (required)"
              className="input-field-sm"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={form.contract_value}
                onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                placeholder="Contract value"
                className="input-field-sm"
              />
              <input
                type="text"
                value={form.community_manager_name}
                onChange={(e) => setForm({ ...form, community_manager_name: e.target.value })}
                placeholder="Manager name"
                className="input-field-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.property_type}
                onChange={(e) => setForm({ ...form, property_type: e.target.value })}
                className="input-field-sm"
              >
                <option value="">Property type...</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={form.number_of_units}
                onChange={(e) => setForm({ ...form, number_of_units: e.target.value })}
                placeholder="Number of units"
                className="input-field-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <input
                type="date"
                value={form.contract_renewal_date}
                onChange={(e) => setForm({ ...form, contract_renewal_date: e.target.value })}
                className="input-field-sm"
                disabled={form.contract_month_to_month}
                placeholder="Contract renewal date"
                title="Contract renewal date"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.contract_month_to_month}
                  onChange={(e) => setForm({ ...form, contract_month_to_month: e.target.checked, contract_renewal_date: e.target.checked ? "" : form.contract_renewal_date })}
                  className="rounded border-gray-300"
                />
                Month-to-month
              </label>
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {saving ? "Saving..." : "Add Community"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(""); }}
                className="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Community Table */}
      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading communities...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10 text-lg">
          {communities.length === 0 ? "No communities yet. Import a CSV or add one manually." : "No communities match your search."}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3">Community</th>
                <th className="px-5 py-3">Contract Value</th>
                <th className="px-5 py-3">Manager</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Units</th>
                <th className="px-5 py-3">Renewal</th>
                <th className="px-5 py-3">Board Members</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id} className="bg-blue-50">
                    <td className="px-5 py-2" colSpan={7}>
                      <div className="grid grid-cols-5 gap-2 py-1">
                        <input
                          type="text"
                          value={editForm.community_name}
                          onChange={(e) => setEditForm({ ...editForm, community_name: e.target.value })}
                          placeholder="Community name"
                          className="input-field-sm"
                        />
                        <input
                          type="number"
                          value={editForm.contract_value}
                          onChange={(e) => setEditForm({ ...editForm, contract_value: e.target.value })}
                          placeholder="Contract value"
                          className="input-field-sm"
                        />
                        <input
                          type="text"
                          value={editForm.community_manager_name}
                          onChange={(e) => setEditForm({ ...editForm, community_manager_name: e.target.value })}
                          placeholder="Manager name"
                          className="input-field-sm"
                        />
                        <select
                          value={editForm.property_type}
                          onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
                          className="input-field-sm"
                        >
                          <option value="">Type...</option>
                          {PROPERTY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={editForm.number_of_units}
                          onChange={(e) => setEditForm({ ...editForm, number_of_units: e.target.value })}
                          placeholder="Units"
                          className="input-field-sm"
                        />
                      </div>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        <input
                          type="date"
                          value={editForm.contract_renewal_date}
                          onChange={(e) => setEditForm({ ...editForm, contract_renewal_date: e.target.value })}
                          className="input-field-sm"
                          disabled={editForm.contract_month_to_month}
                          title="Contract renewal date"
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none col-span-4">
                          <input
                            type="checkbox"
                            checked={editForm.contract_month_to_month}
                            onChange={(e) => setEditForm({ ...editForm, contract_month_to_month: e.target.checked, contract_renewal_date: e.target.checked ? "" : editForm.contract_renewal_date })}
                            className="rounded border-gray-300"
                          />
                          Month-to-month
                        </label>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={editSaving}
                          className="px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: "var(--cam-blue)" }}
                        >
                          {editSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                    <td></td>
                  </tr>
                ) : (
                  <tr key={c.id} className={`hover:bg-gray-50 transition ${c.status === "deactivated" ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {c.community_name}
                      {c.status === "deactivated" && (
                        <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 uppercase">Inactive</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{formatCurrency(c.contract_value)}</td>
                    <td className="px-5 py-3 text-gray-500">{c.community_manager_name || "\u2014"}</td>
                    <td className="px-5 py-3 text-gray-500">{formatPropertyType(c.property_type)}</td>
                    <td className="px-5 py-3 text-gray-500">{c.number_of_units || "\u2014"}</td>
                    <td className="px-5 py-3 text-gray-500">{formatRenewal(c)}</td>
                    <td className="px-5 py-3 text-gray-500">{c.member_count || 0}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(c)} className="p-1 text-gray-300 hover:text-blue-500 transition" title="Edit community">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                        </button>
                        {c.status === "deactivated" ? (
                          <button onClick={() => setToggleTarget(c)} className="p-1 text-gray-300 hover:text-green-500 transition" title="Reactivate community">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-10.624-2.85a5.5 5.5 0 019.201-2.465l.312.31H11.77a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.535a.75.75 0 00-1.5 0v2.033l-.312-.31A7 7 0 002.63 8.387a.75.75 0 001.449.39z" clipRule="evenodd" />
                            </svg>
                          </button>
                        ) : (
                          <button onClick={() => setToggleTarget(c)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Deactivate community">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          </div>
          <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400">
            {filtered.length} communit{filtered.length !== 1 ? "ies" : "y"}
            {search.trim() && ` (${visibleCommunities.length} shown)`}
            {deactivatedCount > 0 && !showDeactivated && ` \u00b7 ${deactivatedCount} deactivated hidden`}
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Community data enriches your dashboards with revenue-at-risk analysis, manager performance comparisons, and property type insights.
          Board members are automatically linked to communities by matching community names.
        </p>
      </div>
      <ConfirmModal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => handleToggleStatus(toggleTarget)}
        title={toggleTarget?.status !== "deactivated" ? "Deactivate Community" : "Reactivate Community"}
        message={toggleTarget?.status !== "deactivated"
          ? `Deactivate "${toggleTarget?.community_name}"? Members won't be contacted in future rounds.`
          : `Reactivate "${toggleTarget?.community_name}"? Members will be included in future rounds.`}
        confirmLabel={toggleTarget?.status !== "deactivated" ? "Deactivate" : "Reactivate"}
        destructive={toggleTarget?.status !== "deactivated"}
      />
    </div>
  );
}
