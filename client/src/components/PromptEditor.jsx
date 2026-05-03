import { useState, useEffect } from "react";

export default function PromptEditor({ isSuperAdmin = false }) {
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const apiBase = isSuperAdmin ? "/api/superadmin" : "/api/admin";

  useEffect(() => {
    fetch(`${apiBase}/prompt`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setPrompt(data.prompt))
      .catch(() => {});
  }, [apiBase]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch(`${apiBase}/prompt`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Failed to save prompt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-lg font-medium text-gray-700 mb-2">System Prompt</label>
      <p className="text-sm text-gray-500 mb-4">
        This prompt controls how the AI chatbot conducts interviews. Changes apply to new sessions.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={14}
        className="w-full px-4 py-3 text-base rounded-xl outline-none transition resize-y"
        style={{
          border: "1px solid var(--line-2)",
          backgroundColor: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
        }}
      />
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 text-lg font-semibold text-white rounded-xl transition disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: "var(--ink)" }}
        >
          {saving ? "Saving…" : "Save prompt"}
        </button>
        {saved && (
          <span className="font-medium" style={{ color: "var(--pulse-deep)" }}>
            Saved!
          </span>
        )}
        {saveError && <span className="text-red-600 font-medium">{saveError}</span>}
      </div>
    </div>
  );
}
