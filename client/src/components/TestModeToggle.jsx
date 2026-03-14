import { useState } from "react";

export default function TestModeToggle({ user, onModeChange }) {
  const [switching, setSwitching] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);

  if (!user?.test_mode_feature) return null;

  const isTest = user.current_mode === "test";

  const handleToggle = async () => {
    const newMode = isTest ? "live" : "test";

    // First time activating test mode: show explainer
    if (newMode === "test" && !showActivateModal) {
      // Check if test mode was ever activated
      try {
        const res = await fetch("/api/admin/mode", { credentials: "include" });
        const data = await res.json();
        if (!data.test_mode_activated) {
          setShowActivateModal(true);
          return;
        }
      } catch {
        // fall through to switch
      }
    }

    await switchMode(newMode);
  };

  const switchMode = async (newMode, confirm = false) => {
    setSwitching(true);
    try {
      const res = await fetch("/api/admin/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: newMode, confirm }),
      });
      const data = await res.json();

      if (data.requires_confirmation) {
        setShowGoLiveModal(true);
        setSwitching(false);
        return;
      }

      setShowActivateModal(false);
      setShowGoLiveModal(false);
      onModeChange(newMode);
    } catch (err) {
      console.error("Failed to switch mode:", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={handleToggle}
        disabled={switching}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
          isTest
            ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
            : "bg-white/15 text-white border-white/30 hover:bg-white/25"
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${isTest ? "bg-amber-500" : "bg-green-400"}`} />
        {switching ? "Switching..." : isTest ? "Test Mode" : "Live"}
      </button>

      {/* Activate Test Mode Modal */}
      {showActivateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowActivateModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Enter Test Mode</h3>
            <p className="text-sm text-gray-600 mb-4">
              This creates a sandbox environment with sample data so you can experience the full
              ResidentPulse workflow — AI interviews, analytics, and insights — before going live
              with real board members.
            </p>
            <ul className="text-sm text-gray-600 mb-5 space-y-1.5">
              <li className="flex gap-2"><span className="text-green-500 font-bold">+</span> 1 test community with 5 sample members</li>
              <li className="flex gap-2"><span className="text-green-500 font-bold">+</span> 1 active test survey round</li>
              <li className="flex gap-2"><span className="text-green-500 font-bold">+</span> No real emails sent — completely safe</li>
              <li className="flex gap-2"><span className="text-green-500 font-bold">+</span> Test data never mixes with live data</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => switchMode("test")}
                disabled={switching}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-green)" }}
              >
                {switching ? "Setting up..." : "Activate Test Mode"}
              </button>
              <button
                onClick={() => setShowActivateModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Go Live Confirmation Modal */}
      {showGoLiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGoLiveModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Switch to Live Mode</h3>
            <p className="text-sm text-gray-600 mb-4">
              You're switching to Live Mode. Your test data stays safely in test mode — live mode
              shows your real members, communities, and survey rounds.
            </p>
            <p className="text-sm text-gray-500 mb-5">
              You can switch back to test mode anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => switchMode("live", true)}
                disabled={switching}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {switching ? "Switching..." : "Go Live"}
              </button>
              <button
                onClick={() => setShowGoLiveModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
