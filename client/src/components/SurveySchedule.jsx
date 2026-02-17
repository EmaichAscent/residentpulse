import { useState, useEffect } from "react";
import ReInterviewDialog from "./ReInterviewDialog";

export default function SurveySchedule({ cadence, maxCadence, onCadenceChange, cadenceUpdating, cadenceMessage }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstDate, setFirstDate] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [launching, setLaunching] = useState(null);
  const [launchResult, setLaunchResult] = useState(null);
  const [confirmLaunch, setConfirmLaunch] = useState(null);
  const [error, setError] = useState(null);
  const [reInterviewPrompt, setReInterviewPrompt] = useState(null);

  useEffect(() => {
    loadRounds();
  }, [cadence]);

  const loadRounds = async () => {
    try {
      const res = await fetch("/api/admin/survey-rounds", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setRounds(data);
      }
    } catch (err) {
      console.error("Failed to load rounds:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!firstDate) return;
    setScheduling(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/survey-rounds/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ first_launch_date: firstDate })
      });
      const data = await res.json();
      if (res.ok) {
        setRounds(data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to schedule rounds");
    } finally {
      setScheduling(false);
    }
  };

  const handlePreLaunchCheck = async (roundId) => {
    // Check if a re-interview should be offered before launching
    try {
      const res = await fetch("/api/admin/interview/status", { credentials: "include" });
      const data = await res.json();

      if (data.hasCompletedInterview && data.lastInterviewDate) {
        setReInterviewPrompt({ roundId, lastInterviewDate: data.lastInterviewDate });
        return;
      }
    } catch {
      // If check fails, just proceed with launch
    }
    setConfirmLaunch(roundId);
  };

  const handleLaunch = async (roundId) => {
    setLaunching(roundId);
    setLaunchResult(null);
    setConfirmLaunch(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/launch`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok) {
        setLaunchResult(data);
        await loadRounds();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to launch round");
    } finally {
      setLaunching(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "concluded": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "in_progress": return "In Progress";
      case "concluded": return "Concluded";
      default: return "Planned";
    }
  };

  const getCircleColor = (status) => {
    switch (status) {
      case "in_progress": return "bg-[var(--cam-blue)] text-white";
      case "concluded": return "bg-[var(--cam-green)] text-white";
      default: return "bg-gray-200 text-gray-500";
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-6">Loading survey schedule...</p>;
  }

  // No rounds yet — show setup
  if (rounds.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Schedule Your First Survey Round</h3>
        <p className="text-sm text-gray-600 mb-4">
          Pick a launch date for your first survey round. We'll calculate the rest of your schedule based on your cadence settings.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            Make sure your board member list is up to date before scheduling. Once you confirm and launch a round, all current board members will receive a survey invitation.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">First Launch Date</label>
            <input
              type="date"
              value={firstDate}
              onChange={(e) => setFirstDate(e.target.value)}
              className="input-field"
            />
          </div>
          <button
            onClick={handleSchedule}
            disabled={!firstDate || scheduling}
            className="btn-primary whitespace-nowrap"
          >
            {scheduling ? "Scheduling..." : "Schedule Rounds"}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>
    );
  }

  // Rounds exist — show timeline
  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Your Survey Rounds</h3>
        {maxCadence >= 4 && onCadenceChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">Cadence:</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => onCadenceChange(2)}
                disabled={cadenceUpdating || cadence === 2}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  cadence === 2
                    ? "text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                } disabled:opacity-50`}
                style={cadence === 2 ? { backgroundColor: "var(--cam-green)" } : {}}
              >
                2x/yr
              </button>
              <button
                onClick={() => onCadenceChange(4)}
                disabled={cadenceUpdating || cadence === 4}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  cadence === 4
                    ? "text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                } disabled:opacity-50`}
                style={cadence === 4 ? { backgroundColor: "var(--cam-green)" } : {}}
              >
                4x/yr
              </button>
            </div>
            {cadenceUpdating && (
              <span className="text-xs text-gray-400">Updating...</span>
            )}
          </div>
        )}
      </div>

      {cadenceMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">{cadenceMessage}</p>
        </div>
      )}

      {launchResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-800">
            Round launched! {launchResult.sent} invitation{launchResult.sent !== 1 ? "s" : ""} sent
            {launchResult.failed > 0 && `, ${launchResult.failed} failed`}.
            Survey closes {formatDate(launchResult.closes_at)}.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {rounds.map((round) => (
          <div key={round.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            {/* Round number circle */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getCircleColor(round.status)}`}>
              {round.round_number}
            </div>

            {/* Round info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-900">Round {round.round_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(round.status)}`}>
                  {getStatusLabel(round.status)}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {round.status === "planned" && (
                  <span>Scheduled for {formatDate(round.scheduled_date)}</span>
                )}
                {round.status === "in_progress" && (
                  <span>
                    Closes {formatDate(round.closes_at)} &middot; {round.responses_completed || 0}/{round.members_invited || 0} responses
                  </span>
                )}
                {round.status === "concluded" && (
                  <span>
                    Concluded {formatDate(round.concluded_at)} &middot; {round.responses_completed || 0}/{round.members_invited || 0} responses
                  </span>
                )}
              </div>
            </div>

            {/* Action button */}
            {round.status === "planned" && (
              <>
                {confirmLaunch === round.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Launch now?</span>
                    <button
                      onClick={() => handleLaunch(round.id)}
                      disabled={launching === round.id}
                      className="text-xs px-3 py-1.5 bg-[var(--cam-blue)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {launching === round.id ? "Launching..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmLaunch(null)}
                      className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handlePreLaunchCheck(round.id)}
                    className="text-sm px-4 py-2 bg-[var(--cam-blue)] text-white rounded-lg font-medium hover:opacity-90"
                  >
                    Confirm & Launch
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {reInterviewPrompt && (
        <ReInterviewDialog
          lastInterviewDate={reInterviewPrompt.lastInterviewDate}
          onSkip={() => setConfirmLaunch(reInterviewPrompt.roundId)}
          onClose={() => setReInterviewPrompt(null)}
        />
      )}
    </div>
  );
}
