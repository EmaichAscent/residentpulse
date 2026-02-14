import { useState, useEffect, useMemo } from "react";

function TrendArrow({ sessions, email }) {
  const userSessions = useMemo(() => {
    if (!sessions || !email) return [];
    return sessions
      .filter((s) => s.email?.toLowerCase() === email.toLowerCase() && s.nps_score !== null && s.nps_score !== undefined)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  }, [sessions, email]);

  if (userSessions.length < 2) {
    // Gray dash — one or no responses
    return (
      <span className="text-gray-400" title={userSessions.length === 0 ? "No responses" : "1 response"}>
        —
      </span>
    );
  }

  const prev = userSessions[userSessions.length - 2].nps_score;
  const latest = userSessions[userSessions.length - 1].nps_score;

  if (latest > prev) {
    return (
      <span className="text-green-600" title={`${prev} → ${latest}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline">
          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }

  if (latest < prev) {
    return (
      <span className="text-red-600" title={`${prev} → ${latest}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline">
          <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }

  // Same score
  return (
    <span className="text-gray-400" title={`${prev} → ${latest}`}>
      —
    </span>
  );
}

export default function UserManager({ sessions }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", community_name: "", management_company: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchUsers = () => {
    fetch("/api/admin/board-members")
      .then((r) => r.json())
      .then((data) => setUsers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/board-members/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      fetchUsers();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.email || !form.email.includes("@")) {
      setFormError("Valid email is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/board-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => [data, ...prev]);
      setForm({ email: "", first_name: "", last_name: "", community_name: "", management_company: "" });
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, email) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await fetch(`/api/admin/board-members/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (editingId === id) setEditingId(null);
    } catch {
      // silently fail
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      email: u.email || "",
      community_name: u.community_name || "",
      management_company: u.management_company || "",
    });
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    setEditError("");
    if (!editForm.email || !editForm.email.includes("@")) {
      setEditError("Valid email is required.");
      return;
    }

    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/board-members/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers((prev) => prev.map((u) => (u.id === editingId ? data : u)));
      setEditingId(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const downloadSampleCSV = () => {
    const csv = `email,first_name,last_name,community_name,management_company
resident1@example.com,John,Doe,Sunset Gardens,ABC Property Management
resident2@example.com,Jane,Smith,Oak Hills,ABC Property Management`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return (
          u.email?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.last_name?.toLowerCase().includes(q) ||
          u.community_name?.toLowerCase().includes(q) ||
          u.management_company?.toLowerCase().includes(q)
        );
      })
    : users;

  return (
    <div className="space-y-6">
      {/* Search Bar with Import and Add Buttons */}
      <div>
        <div className="flex gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search board members..."
            className="input-field flex-1"
          />
          <label className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-lg cursor-pointer transition hover:opacity-90 disabled:opacity-50 whitespace-nowrap" style={{ backgroundColor: "var(--cam-blue)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            {uploading ? "Uploading..." : "Import"}
            <input type="file" accept=".csv" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <button
            onClick={() => { setShowForm(!showForm); setFormError(""); }}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: "var(--cam-blue)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add User
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Need help with the CSV format?{" "}
          <button
            onClick={downloadSampleCSV}
            className="font-medium hover:underline"
            style={{ color: "var(--cam-blue)" }}
          >
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
              <p>{result.created} created, {result.updated} updated ({result.total} total)</p>
              {result.errors?.length > 0 && (
                <div className="mt-2 text-red-600">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add User Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Add New User</p>
          <form onSubmit={handleAddUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="First name"
                className="input-field !py-3 !text-sm"
              />
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Last name"
                className="input-field !py-3 !text-sm"
              />
            </div>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email (required)"
              className="input-field !py-3 !text-sm"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={form.community_name}
                onChange={(e) => setForm({ ...form, community_name: e.target.value })}
                placeholder="Community name"
                className="input-field !py-3 !text-sm"
              />
              <input
                type="text"
                value={form.management_company}
                onChange={(e) => setForm({ ...form, management_company: e.target.value })}
                placeholder="Management company"
                className="input-field !py-3 !text-sm"
              />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {saving ? "Saving..." : "Add User"}
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

      {/* User List */}
      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading users...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10 text-lg">
          {users.length === 0 ? "No users yet. Import a CSV to get started." : "No users match your search."}
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <th className="px-5 py-3 w-8">Trend</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Community</th>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                editingId === u.id ? (
                  <tr key={u.id} className="bg-blue-50">
                    <td className="px-5 py-3 text-center">
                      <TrendArrow sessions={sessions} email={u.email} />
                    </td>
                    <td className="px-5 py-2" colSpan={4}>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editForm.first_name}
                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                            placeholder="First name"
                            className="input-field !py-2 !text-sm"
                          />
                          <input
                            type="text"
                            value={editForm.last_name}
                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                            placeholder="Last name"
                            className="input-field !py-2 !text-sm"
                          />
                        </div>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="Email (required)"
                          className="input-field !py-2 !text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editForm.community_name}
                            onChange={(e) => setEditForm({ ...editForm, community_name: e.target.value })}
                            placeholder="Community name"
                            className="input-field !py-2 !text-sm"
                          />
                          <input
                            type="text"
                            value={editForm.management_company}
                            onChange={(e) => setEditForm({ ...editForm, management_company: e.target.value })}
                            placeholder="Management company"
                            className="input-field !py-2 !text-sm"
                          />
                        </div>
                        {editError && <p className="text-red-600 text-sm">{editError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={editSaving}
                            className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: "var(--cam-blue)" }}
                          >
                            {editSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"></td>
                  </tr>
                ) : (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 text-center">
                      <TrendArrow sessions={sessions} email={u.email} />
                    </td>
                    <td className="px-5 py-3 text-gray-900">
                      {u.first_name || u.last_name
                        ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{u.email}</td>
                    <td className="px-5 py-3 text-gray-500">{u.community_name || "—"}</td>
                    <td className="px-5 py-3 text-gray-500">{u.management_company || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(u)}
                          className="p-1 text-gray-300 hover:text-blue-500 transition"
                          title="Edit user"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          className="p-1 text-gray-300 hover:text-red-500 transition"
                          title="Delete user"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-gray-50 text-xs text-gray-400">
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
            {search.trim() && ` (${users.length} total)`}
          </div>
        </div>
      )}
    </div>
  );
}
