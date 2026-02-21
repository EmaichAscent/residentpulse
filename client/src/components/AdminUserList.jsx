import { useState } from "react";

export default function AdminUserList({ users, onRemove, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [saving, setSaving] = useState(false);

  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No admin users found
      </div>
    );
  }

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditFirst(user.first_name || "");
    setEditLast(user.last_name || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFirst("");
    setEditLast("");
  };

  const handleSave = async (userId) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: editFirst, last_name: editLast }),
        credentials: "include"
      });
      if (res.ok) {
        setEditingId(null);
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error("Failed to update user:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap">
                {editingId === user.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editFirst}
                      onChange={(e) => setEditFirst(e.target.value)}
                      className="input-field-sm w-24"
                      placeholder="First"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editLast}
                      onChange={(e) => setEditLast(e.target.value)}
                      className="input-field-sm w-24"
                      placeholder="Last"
                    />
                  </div>
                ) : (
                  <div className="text-sm font-medium text-gray-900">
                    {user.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : "—"}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm text-gray-900">{user.email}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                {editingId === user.id ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleSave(user.id)}
                      disabled={saving}
                      className="text-xs px-2.5 py-1 rounded font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "var(--cam-green)" }}
                    >
                      {saving ? "..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs px-2.5 py-1 rounded font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => startEdit(user)}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--cam-blue)" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onRemove(user.id)}
                      className="text-sm font-medium text-red-600 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
