import { useState, useEffect, useCallback } from "react";
import ConfirmModal from "./ConfirmModal";

/**
 * Renders the saved-version history for a single prompt key.
 * Used in SuperAdminSettings under each prompt editor.
 *
 * Behavior
 *  - Loads versions for the given promptKey on mount and whenever
 *    `refreshSignal` changes (parent bumps it after a save to force reload).
 *  - "Save current as version" button captures the current textarea value
 *    with an optional label.
 *  - "Load" puts the version's text back into the textarea (parent's
 *    onLoadVersion callback) without changing the live current value.
 *  - "Restore" promotes a version to be the new current value via the
 *    server's restore endpoint, then triggers parent reload.
 *  - Restore + delete prompt for confirmation.
 *
 * Props
 *  promptKey       — settings key (e.g. "system_prompt", "interview_initial_prompt")
 *  currentText     — text currently in the editor (used for Save-as-version)
 *  onLoadVersion   — fn(text) to populate the editor with a version's text
 *  onRestored      — optional fn() called after a successful restore so the
 *                    parent can refetch the live prompt value
 */
export default function PromptVersionHistory({
  promptKey,
  currentText,
  onLoadVersion,
  onRestored,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/superadmin/prompt/versions?key=${encodeURIComponent(promptKey)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load versions");
      setVersions(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [promptKey]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAsVersion = async () => {
    if (!currentText?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/prompt/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: promptKey,
          prompt_text: currentText,
          label: label || "Saved version",
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Save failed");
      setLabel("");
      setShowLabelInput(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async () => {
    if (!restoreTarget) return;
    try {
      const res = await fetch(`/api/superadmin/prompt/versions/${restoreTarget.id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Restore failed");
      }
      setRestoreTarget(null);
      await load();
      if (onRestored) onRestored();
    } catch (err) {
      setError(err.message);
      setRestoreTarget(null);
    }
  };

  const deleteVersion = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/superadmin/prompt/versions/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Version history
          {!loading && versions.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">({versions.length})</span>
          )}
        </h3>
        {!showLabelInput && (
          <button
            onClick={() => setShowLabelInput(true)}
            className="text-xs px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
          >
            Save current as version
          </button>
        )}
      </div>

      {showLabelInput && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. 'Tightened anti-abstraction wording')"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
          <button
            onClick={saveAsVersion}
            disabled={saving || !currentText?.trim()}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: "var(--pulse)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setShowLabelInput(false);
              setLabel("");
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading versions…</p>
      ) : versions.length === 0 ? (
        <p className="text-xs text-gray-400">No saved versions yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {v.label || "Saved version"}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(v.created_at).toLocaleString()} · {v.created_by || "unknown"}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onLoadVersion?.(v.prompt_text)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                  title="Copy this version's text into the editor (doesn't change the live value)"
                >
                  Load
                </button>
                <button
                  onClick={() => setRestoreTarget(v)}
                  className="text-xs px-2 py-1 rounded text-white font-medium transition"
                  style={{ backgroundColor: "var(--pulse)" }}
                  title="Make this version the live current value"
                >
                  Restore
                </button>
                <button
                  onClick={() => setDeleteTarget(v)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 transition"
                  title="Delete this saved version"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={restoreVersion}
        title="Restore this version"
        message={
          restoreTarget
            ? `Restore "${restoreTarget.label || "Saved version"}" as the current live prompt?\n\nThe currently active prompt will be auto-saved as a new version first, so the restore is reversible.`
            : ""
        }
        confirmLabel="Restore"
      />
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteVersion}
        title="Delete this version"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.label || "Saved version"}"?\n\nThis cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
