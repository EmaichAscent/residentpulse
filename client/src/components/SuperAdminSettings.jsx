import { useState, useEffect } from "react";
import ConfirmModal from "./ConfirmModal";
import TypedConfirmModal from "./TypedConfirmModal";
import PromptVersionHistory from "./PromptVersionHistory";
import TestInterviewModal from "./TestInterviewModal";

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
  // ── Prompt state ──
  const [prompt, setPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptError, setPromptError] = useState(null);

  // ── Version history state ──
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [showVersionLabel, setShowVersionLabel] = useState(false);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionSaving, setVersionSaving] = useState(false);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState(null);

  // ── AI assistant state ──
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState(null);

  // ── Interview prompts state ──
  const INTERVIEW_TABS = [
    {
      key: "interview_initial_prompt",
      label: "Initial Onboarding",
      desc: "Used when a new client admin completes their first onboarding interview.",
    },
    {
      key: "interview_re_prompt",
      label: "Re-Interview",
      desc: "Used when a returning client admin does a check-in before a new survey round.",
    },
    {
      key: "prompt_generation_instruction",
      label: "Prompt Generation",
      desc: "Instructions for AI to generate the client-specific prompt supplement after an interview.",
    },
  ];
  const [interviewPrompts, setInterviewPrompts] = useState({});
  const [interviewPromptsLoading, setInterviewPromptsLoading] = useState(true);
  const [interviewTab, setInterviewTab] = useState("interview_initial_prompt");
  const [interviewSaving, setInterviewSaving] = useState(false);
  const [interviewSaved, setInterviewSaved] = useState(null); // key that was just saved
  const [interviewError, setInterviewError] = useState(null);

  // ── Test Interview modal ──
  const [showTestInterview, setShowTestInterview] = useState(false);

  // ── AI provider toggle (Anthropic vs xAI) ──
  // Drives every board-chat reply, every round-insights call, every
  // session summary. Operator flips this to A/B test Grok against
  // Claude on the same prompts. The xaiKeyConfigured flag comes from
  // the server (true iff XAI_API_KEY is set in the environment); we
  // disable the xAI radio when it's missing so the operator can't put
  // the system into a state where every chat 500s.
  const [aiProvider, setAiProvider] = useState("anthropic");
  const [aiProviderLoading, setAiProviderLoading] = useState(true);
  const [aiProviderSaving, setAiProviderSaving] = useState(false);
  const [aiProviderError, setAiProviderError] = useState(null);
  const [aiProviderSavedAt, setAiProviderSavedAt] = useState(null);
  const [xaiKeyConfigured, setXaiKeyConfigured] = useState(false);

  // ── Plans state ──
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [isNewPlan, setIsNewPlan] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState(null);

  // ── Load all data on mount ──
  useEffect(() => {
    loadPrompt();
    loadVersions();
    loadInterviewPrompts();
    loadPlans();
    loadAiProvider();
  }, []);

  // ── AI provider API ──
  const loadAiProvider = async () => {
    try {
      const res = await fetch("/api/superadmin/ai-provider", { credentials: "include" });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        throw new Error(`ai-provider returned ${res.status}`);
      }
      const data = await res.json();
      setAiProvider(data.provider || "anthropic");
      setXaiKeyConfigured(Boolean(data.xai_key_configured));
    } catch (err) {
      setAiProviderError(err.message);
    } finally {
      setAiProviderLoading(false);
    }
  };

  const saveAiProvider = async (newProvider) => {
    if (newProvider === aiProvider) return;
    setAiProviderSaving(true);
    setAiProviderError(null);
    try {
      const res = await fetch("/api/superadmin/ai-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: newProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setAiProvider(data.provider);
      setAiProviderSavedAt(Date.now());
    } catch (err) {
      setAiProviderError(err.message);
    } finally {
      setAiProviderSaving(false);
    }
  };

  // ── Prompt API ──
  const loadPrompt = async () => {
    try {
      const res = await fetch("/api/superadmin/prompt", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt || "");
      }
    } finally {
      setPromptLoading(false);
    }
  };

  const savePrompt = async () => {
    setPromptSaving(true);
    setPromptSaved(false);
    setPromptError(null);
    try {
      const res = await fetch("/api/superadmin/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Save failed");
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 3000);
      await loadVersions(); // refresh — auto-save may have created a version
    } catch {
      setPromptError("Failed to save prompt. Please try again.");
    } finally {
      setPromptSaving(false);
    }
  };

  // ── Versions API ──
  const loadVersions = async () => {
    try {
      const res = await fetch("/api/superadmin/prompt/versions", { credentials: "include" });
      if (res.ok) setVersions(await res.json());
    } finally {
      setVersionsLoading(false);
    }
  };

  const saveAsVersion = async () => {
    if (!prompt.trim()) return;
    setVersionSaving(true);
    try {
      const res = await fetch("/api/superadmin/prompt/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_text: prompt, label: versionLabel || "Saved version" }),
        credentials: "include",
      });
      if (res.ok) {
        setVersionLabel("");
        setShowVersionLabel(false);
        await loadVersions();
      }
    } finally {
      setVersionSaving(false);
    }
  };

  const deleteVersion = async () => {
    if (!deleteVersionTarget) return;
    try {
      await fetch(`/api/superadmin/prompt/versions/${deleteVersionTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadVersions();
    } finally {
      setDeleteVersionTarget(null);
    }
  };

  const loadVersion = (v) => {
    setPrompt(v.prompt_text);
    setPromptSaved(false);
  };

  // ── AI Assistant ──
  const runAssistant = async () => {
    if (!assistantInput.trim()) return;
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const res = await fetch("/api/superadmin/prompt/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_prompt: prompt, instructions: assistantInput }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI assistant failed");
      }
      const data = await res.json();
      setPrompt(data.prompt);
      setAssistantInput("");
      setPromptSaved(false);
    } catch (err) {
      setAssistantError(err.message);
    } finally {
      setAssistantLoading(false);
    }
  };

  // ── Interview Prompts API ──
  const loadInterviewPrompts = async () => {
    try {
      const res = await fetch("/api/superadmin/interview-prompts", { credentials: "include" });
      if (res.ok) setInterviewPrompts(await res.json());
    } finally {
      setInterviewPromptsLoading(false);
    }
  };

  const saveInterviewPrompt = async (key) => {
    setInterviewSaving(true);
    setInterviewSaved(null);
    setInterviewError(null);
    try {
      const res = await fetch("/api/superadmin/interview-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: interviewPrompts[key] }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Save failed");
      setInterviewSaved(key);
      setTimeout(() => setInterviewSaved(null), 3000);
    } catch {
      setInterviewError("Failed to save. Please try again.");
    } finally {
      setInterviewSaving(false);
    }
  };

  // ── Plans API ──
  const loadPlans = async () => {
    try {
      const res = await fetch("/api/superadmin/plans", { credentials: "include" });
      if (res.ok) setPlans(await res.json());
    } finally {
      setPlansLoading(false);
    }
  };

  const startCreatePlan = () => {
    setEditingPlan({ ...EMPTY_PLAN });
    setIsNewPlan(true);
    setPlanError(null);
  };
  const startEditPlan = (plan) => {
    setEditingPlan({ ...plan });
    setIsNewPlan(false);
    setPlanError(null);
  };
  const cancelEditPlan = () => {
    setEditingPlan(null);
    setIsNewPlan(false);
    setPlanError(null);
  };

  const savePlan = async () => {
    setPlanSaving(true);
    setPlanError(null);
    try {
      const body = {
        display_name: editingPlan.display_name,
        member_limit: Number(editingPlan.member_limit) || 0,
        survey_rounds_per_year: Number(editingPlan.survey_rounds_per_year) || 2,
        price_cents:
          editingPlan.price_cents === "" || editingPlan.price_cents === null
            ? null
            : Number(editingPlan.price_cents),
        is_public: editingPlan.is_public,
        sort_order: Number(editingPlan.sort_order) || 0,
        zoho_plan_code: editingPlan.zoho_plan_code || null,
      };
      if (isNewPlan) body.name = editingPlan.name;

      const res = await fetch(
        isNewPlan ? "/api/superadmin/plans" : `/api/superadmin/plans/${editingPlan.id}`,
        {
          method: isNewPlan ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setPlanError(data.error || "Failed to save plan");
        return;
      }
      setEditingPlan(null);
      setIsNewPlan(false);
      await loadPlans();
    } catch (err) {
      setPlanError("Failed to save: " + err.message);
    } finally {
      setPlanSaving(false);
    }
  };

  const deletePlan = async () => {
    if (!deletePlanTarget) return;
    try {
      const res = await fetch(`/api/superadmin/plans/${deletePlanTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setPlanError(data.error || "Failed to delete plan");
      } else {
        setPlanError(null);
        await loadPlans();
      }
    } catch (err) {
      setPlanError("Failed to delete: " + err.message);
    } finally {
      setDeletePlanTarget(null);
    }
  };

  const formatPrice = (cents) => {
    if (cents === null || cents === undefined) return "Free";
    return `$${(cents / 100).toLocaleString()}/mo`;
  };

  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const planField = (label, key, type = "text", opts = {}) => (
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
      {/* ━━━━ AI PROVIDER TOGGLE ━━━━ */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI provider</h2>
            <p className="text-sm text-gray-500">
              Routes every board-chat reply, round-insights call, and session summary. Switch
              providers to A/B test them on the same prompts. Critical-alert detection stays on
              Anthropic Haiku regardless.
            </p>
          </div>
          {aiProviderSavedAt && Date.now() - aiProviderSavedAt < 4000 && (
            <span
              className="text-[10.5px] font-bold uppercase flex-shrink-0"
              style={{
                backgroundColor: "var(--pulse-soft)",
                color: "var(--pulse-deep)",
                padding: "2px 8px",
                borderRadius: 999,
                letterSpacing: "0.08em",
              }}
            >
              Saved ✓
            </span>
          )}
        </div>

        {aiProviderLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border hover:bg-gray-50">
              <input
                type="radio"
                name="ai-provider"
                value="anthropic"
                checked={aiProvider === "anthropic"}
                disabled={aiProviderSaving}
                onChange={() => saveAiProvider("anthropic")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900">Anthropic Claude</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Sonnet 4.5 for chat &amp; insights · Haiku 4.5 for critical-alert classifier.
                  Default. Always available.
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                xaiKeyConfigured
                  ? "cursor-pointer hover:bg-gray-50"
                  : "cursor-not-allowed opacity-60"
              }`}
              title={
                xaiKeyConfigured
                  ? "Switch to xAI Grok"
                  : "XAI_API_KEY is not set in the server environment"
              }
            >
              <input
                type="radio"
                name="ai-provider"
                value="xai"
                checked={aiProvider === "xai"}
                disabled={aiProviderSaving || !xaiKeyConfigured}
                onChange={() => saveAiProvider("xai")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-900">
                  xAI Grok
                  {!xaiKeyConfigured && (
                    <span className="ml-2 text-[10.5px] font-bold uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      XAI_API_KEY missing
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  grok-4.3-latest (xAI&apos;s current flagship, 1M token context, $1.25/M in /
                  $2.50/M out). Requires XAI_API_KEY in the server environment.
                </div>
              </div>
            </label>

            {aiProviderError && <p className="text-sm text-red-600 mt-1">{aiProviderError}</p>}
            {aiProviderSaving && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
          </div>
        )}
      </div>

      {/* ━━━━ SYSTEM PROMPT CARD ━━━━ */}
      <div className="bg-white rounded-xl border p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System Prompt</h2>
            <p className="text-sm text-gray-500">
              The global prompt used when interviewing board members. Client-specific supplements
              are appended automatically.
            </p>
          </div>
          <button
            onClick={() => setShowTestInterview(true)}
            className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-lg text-white transition"
            style={{ backgroundColor: "var(--ink)" }}
            title="Step through scripted persona transcripts to see V2 rules fire"
          >
            Test with sample resident
          </button>
        </div>

        {/* Prompt textarea */}
        {promptLoading ? (
          <p className="text-sm text-gray-400">Loading prompt...</p>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptSaved(false);
              }}
              rows={12}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition resize-y font-mono leading-relaxed"
            />

            {/* AI Prompt Assistant */}
            <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                AI Prompt Assistant
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !assistantLoading && runAssistant()}
                  placeholder="e.g. Make the tone more conversational, add questions about financial transparency..."
                  className="input-field-sm flex-1"
                  disabled={assistantLoading}
                />
                <button
                  onClick={runAssistant}
                  disabled={assistantLoading || !assistantInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                  style={{ backgroundColor: "var(--cam-blue)" }}
                >
                  {assistantLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Improving...
                    </span>
                  ) : (
                    "Improve with AI"
                  )}
                </button>
              </div>
              {assistantError && <p className="text-xs text-red-600 mt-2">{assistantError}</p>}
              <p className="text-xs text-gray-400 mt-2">
                Describe what you'd like to change and AI will rewrite the prompt. Review the result
                before saving.
              </p>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={savePrompt} disabled={promptSaving} className="btn-primary-sm">
                {promptSaving ? "Saving..." : "Save Prompt"}
              </button>

              {showVersionLabel ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !versionSaving && saveAsVersion()}
                    placeholder="Version label..."
                    className="input-field-sm w-48"
                    autoFocus
                  />
                  <button
                    onClick={saveAsVersion}
                    disabled={versionSaving}
                    className="px-3 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-40"
                    style={{ backgroundColor: "var(--cam-green)" }}
                  >
                    {versionSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setShowVersionLabel(false);
                      setVersionLabel("");
                    }}
                    className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowVersionLabel(true)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Save as Version
                </button>
              )}

              {promptSaved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
              {promptError && (
                <span className="text-sm text-red-600 font-medium">{promptError}</span>
              )}
            </div>
          </>
        )}

        {/* Saved Versions */}
        {!promptLoading && (
          <div className="mt-6 border-t pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Saved Versions {versions.length > 0 && `(${versions.length})`}
            </p>
            {versionsLoading ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-gray-400">
                No saved versions yet. Versions are auto-saved when you update the live prompt.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {v.label || "Untitled"}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatDate(v.created_at)}
                        </span>
                        {v.created_by && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            by {v.created_by}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {v.prompt_text?.substring(0, 100)}...
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => loadVersion(v)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => setDeleteVersionTarget(v)}
                        className="px-2 py-1 text-xs font-medium text-red-500 hover:text-red-700 transition"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ━━━━ INTERVIEW PROMPTS CARD ━━━━ */}
      <div className="bg-white rounded-xl border p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Interview Prompts</h2>
          <p className="text-sm text-gray-500">
            Prompts used during the client admin onboarding interview and prompt supplement
            generation.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          {INTERVIEW_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setInterviewTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                interviewTab === t.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {interviewPromptsLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {INTERVIEW_TABS.find((t) => t.key === interviewTab)?.desc}
            </p>
            <textarea
              value={interviewPrompts[interviewTab] || ""}
              onChange={(e) =>
                setInterviewPrompts({ ...interviewPrompts, [interviewTab]: e.target.value })
              }
              rows={10}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition resize-y font-mono leading-relaxed"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => saveInterviewPrompt(interviewTab)}
                disabled={interviewSaving}
                className="btn-primary-sm"
              >
                {interviewSaving ? "Saving..." : "Save"}
              </button>
              {interviewSaved === interviewTab && (
                <span className="text-sm text-green-600 font-medium">Saved!</span>
              )}
              {interviewError && (
                <span className="text-sm text-red-600 font-medium">{interviewError}</span>
              )}
            </div>
            <PromptVersionHistory
              key={interviewTab}
              promptKey={interviewTab}
              currentText={interviewPrompts[interviewTab] || ""}
              onLoadVersion={(text) =>
                setInterviewPrompts({ ...interviewPrompts, [interviewTab]: text })
              }
              onRestored={loadInterviewPrompts}
            />
          </>
        )}
      </div>

      {/* ━━━━ SUBSCRIPTION PLANS CARD ━━━━ */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Subscription Plans</h2>
            <p className="text-sm text-gray-500">Manage plan tiers and their limits.</p>
          </div>
          {!editingPlan && (
            <button onClick={startCreatePlan} className="btn-primary-sm">
              Add Plan
            </button>
          )}
        </div>

        {planError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {planError}
          </div>
        )}

        {/* Edit / Create Form */}
        {editingPlan && (
          <div className="bg-gray-50 rounded-lg border p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {isNewPlan ? "New Plan" : `Edit: ${editingPlan.display_name}`}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {planField("Display Name *", "display_name", "text", { placeholder: "Growth 500" })}
              {planField("Internal Name *", "name", "text", {
                placeholder: "growth-500",
                disabled: !isNewPlan,
              })}
              {planField("Member Limit", "member_limit", "number")}
              {planField("Rounds/Year", "survey_rounds_per_year", "number")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {planField("Price (cents)", "price_cents", "number", {
                placeholder: "e.g. 10000 = $100",
              })}
              {planField("Sort Order", "sort_order", "number")}
              {planField("Zoho Plan Code", "zoho_plan_code", "text", { placeholder: "growth-500" })}
              {planField("Public?", "is_public", "checkbox")}
            </div>
            <div className="flex gap-2">
              <button onClick={savePlan} disabled={planSaving} className="btn-primary-sm">
                {planSaving ? "Saving..." : isNewPlan ? "Create Plan" : "Save Changes"}
              </button>
              <button
                onClick={cancelEditPlan}
                disabled={planSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Plans Table */}
        {plansLoading ? (
          <p className="text-sm text-gray-400">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-gray-400">No plans defined.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
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
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {p.member_limit?.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {p.survey_rounds_per_year}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {formatPrice(p.price_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                      {p.zoho_plan_code || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{p.client_count || 0}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          p.is_public ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {p.is_public ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => startEditPlan(p)}
                          disabled={!!editingPlan}
                          className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletePlanTarget(p)}
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

      {/* ── Modals ── */}
      <TypedConfirmModal
        isOpen={!!deletePlanTarget}
        onClose={() => setDeletePlanTarget(null)}
        onConfirm={deletePlan}
        title={`Delete plan "${deletePlanTarget?.display_name || ""}"`}
        message={`This plan has ${deletePlanTarget?.client_count || 0} client(s). Plans with active clients cannot be deleted.\n\nThis cannot be undone.`}
        confirmPhrase={deletePlanTarget?.display_name || ""}
        confirmLabel="Delete"
      />
      <ConfirmModal
        isOpen={!!deleteVersionTarget}
        onClose={() => setDeleteVersionTarget(null)}
        onConfirm={deleteVersion}
        title="Delete Version"
        message={`Delete saved version "${deleteVersionTarget?.label || "Untitled"}"?\n\nThis cannot be undone.`}
        confirmLabel="Delete"
        destructive
      />
      <TestInterviewModal isOpen={showTestInterview} onClose={() => setShowTestInterview(false)} />
    </div>
  );
}
