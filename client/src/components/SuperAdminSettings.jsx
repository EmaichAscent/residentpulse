import { useState, useEffect } from "react";
import PromptEditor from "./PromptEditor";
import ConfirmModal from "./ConfirmModal";

const EMPTY_PLAN = {
  name: "",
  display_name: "",
  member_limit: 0,
  survey_rounds_per_year: 2,
  price_cents: null,
  is_public: true,
  sort_order: 0,
  zoho_plan_code: "",
};

export default function SuperAdminSettings() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null); // plan object being edited
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/superadmin/plans", { credentials: "include" });
      if (res.ok) setPlans(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const startCreate = () => {
    setEditingPlan({ ...EMPTY_PLAN });
    setIsNew(true);
    setError(null);
  };

  const startEdit = (plan) => {
    setEditingPlan({ ...plan });
    setIsNew(false);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingPlan(null);
    setIsNew(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        display_name: editingPlan.display_name,
        member_limit: Number(editingPlan.member_limit) || 0,
        survey_rounds_per_year: Number(editingPlan.survey_rounds_per_year) || 2,
        price_cents: editingPlan.price_cents === "" || editingPlan.price_cents === null ? null : Number(editingPlan.price_cents),
        is_public: editingPlan.is_public,
        sort_order: Number(editingPlan.sort_order) || 0,
        zoho_plan_code: editingPlan.zoho_plan_code || null,
      };

      if (isNew) {
        body.name = editingPlan.name;
      }

      const url = isNew
        ? "/api/superadmin/plans"
        : `/api/superadmin/plans/${editingPlan.id}`;

      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save plan");
        return;
      }

      setEditingPlan(null);
      setIsNew(false);
      await loadPlans();
    } catch (err) {
      setError("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/superadmin/plans/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete plan");
      } else {
        setError(null);
        await loadPlans();
      }
    } catch (err) {
      setError("Failed to delete: " + err.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const formatPrice = (cents) => {
    if (cents === null || cents === undefined) return "Free";
    return `$${(cents / 100).toLocaleString()}/mo`;
  };

  const field = (label, key, type = "text", opts = {}) => (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {type === "checkbox" ? (
        <input
          type="checkbox"
          checked={editingPlan[key] || false}
          onChange={(e) => setEditingPlan({ ...editingPlan, [key]: e.target.checked })}
          className="mt-1 ml-1 h-4 w-4"
        />
      ) : (
        <input
          type={type}
          value={editingPlan[key] ?? ""}
          onChange={(e) => setEditingPlan({ ...editingPlan, [key]: e.target.value })}
          className="input-field-sm mt-1"
          placeholder={opts.placeholder}
          disabled={opts.disabled}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Base System Prompt */}
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

      {/* Subscription Plans */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Subscription Plans</h2>
            <p className="text-sm text-gray-500">Manage plan tiers and their limits.</p>
          </div>
          {!editingPlan && (
            <button onClick={startCreate} className="btn-primary-sm">Add Plan</button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Edit / Create Form */}
        {editingPlan && (
          <div className="bg-white rounded-xl border p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {isNew ? "New Plan" : `Edit: ${editingPlan.display_name}`}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {field("Display Name *", "display_name", "text", { placeholder: "Growth 500" })}
              {field("Internal Name *", "name", "text", { placeholder: "growth-500", disabled: !isNew })}
              {field("Member Limit", "member_limit", "number")}
              {field("Rounds/Year", "survey_rounds_per_year", "number")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {field("Price (cents)", "price_cents", "number", { placeholder: "e.g. 10000 = $100" })}
              {field("Sort Order", "sort_order", "number")}
              {field("Zoho Plan Code", "zoho_plan_code", "text", { placeholder: "growth-500" })}
              {field("Public?", "is_public", "checkbox")}
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary-sm">
                {saving ? "Saving..." : isNew ? "Create Plan" : "Save Changes"}
              </button>
              <button onClick={cancelEdit} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Plans Table */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-gray-400">No plans defined.</p>
        ) : (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Display Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Name</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Members</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Rounds/Yr</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Price</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Zoho Code</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Clients</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Public</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.display_name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{p.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{p.member_limit?.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{p.survey_rounds_per_year}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatPrice(p.price_cents)}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{p.zoho_plan_code || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{p.client_count || 0}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        p.is_public ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {p.is_public ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => startEdit(p)}
                          disabled={!!editingPlan}
                          className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(p)}
                          disabled={!!editingPlan || p.name === "free"}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-40"
                          title={p.name === "free" ? "Cannot delete the free plan" : ""}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Plan"
        message={`Delete "${deleteTarget?.display_name}"?\n\nThis plan has ${deleteTarget?.client_count || 0} client(s). Plans with active clients cannot be deleted.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
