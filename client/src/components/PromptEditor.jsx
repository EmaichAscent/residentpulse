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
        credentials: "include"
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
        className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition resize-y"
      />
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Prompt"}
        </button>
        {saved && <span className="text-green-600 font-medium">Saved!</span>}
        {saveError && <span className="text-red-600 font-medium">{saveError}</span>}
      </div>
    </div>
  );
}
