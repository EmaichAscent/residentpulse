import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReInterviewDialog from "./ReInterviewDialog";

export default function SurveySchedule({ cadence, maxCadence, onCadenceChange, cadenceUpdating, cadenceMessage, embedded, onScheduled }) {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstDate, setFirstDate] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [launching, setLaunching] = useState(null);
  const [launchResult, setLaunchResult] = useState(null);
  const [confirmLaunch, setConfirmLaunch] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [closingRound, setClosingRound] = useState(null);
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
        if (onScheduled) onScheduled();
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
        const daysSince = Math.floor((Date.now() - new Date(data.lastInterviewDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince < 60) {
          // Recent interview — skip dialog, launch directly
          handleLaunch(roundId);
          return;
        }
        setReInterviewPrompt({ roundId, lastInterviewDate: data.lastInterviewDate, interviewSummary: data.interviewSummary });
        return;
      }
    } catch {
      // If check fails, just proceed with launch
    }
    handleLaunch(roundId);
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
    // For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-");
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const daysRemaining = (closesAt) => {
    if (!closesAt) return null;
    const diff = new Date(closesAt) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handleCloseRound = async (roundId) => {
    setClosingRound(roundId);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmClose(null);
        await loadRounds();
      }
    } catch (err) {
      console.error("Failed to close round:", err);
    } finally {
      setClosingRound(null);
    }
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
    const Wrapper = embedded ? "div" : ({ children }) => (
      <div className="bg-white rounded-xl border p-6">{children}</div>
    );

    return (
      <Wrapper>
        {!embedded && (
          <>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Schedule Your First Survey Round</h3>
            <p className="text-sm text-gray-600 mb-4">
              Pick a launch date for your first survey round. We'll calculate the rest of your schedule based on your cadence settings.
            </p>
          </>
        )}

        {embedded ? (
          <>
            <p className="text-xs text-gray-500 mb-3">All current board members will be invited when you launch.</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Launch Date</label>
              <input
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="input-field-sm"
              />
            </div>
            <button
              onClick={handleSchedule}
              disabled={!firstDate || scheduling}
              className="btn-primary-sm w-full mt-3"
            >
              {scheduling ? "Scheduling..." : "Schedule First Survey"}
            </button>
          </>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                Make sure your board member list is up to date before scheduling. Once you confirm and launch a round, all current board members will receive a survey invitation.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Launch Date</label>
              <div className="flex items-end gap-3">
                <div className="flex-1">
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
            </div>
          </>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </Wrapper>
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
                disabled={cadenceUpdating}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  cadence === 2
                    ? "text-white shadow-sm cursor-default"
                    : "text-gray-500 hover:text-gray-700 cursor-pointer"
                } ${cadenceUpdating ? "opacity-50" : ""}`}
                style={cadence === 2 ? { backgroundColor: "var(--cam-green)" } : {}}
              >
                2x/yr
              </button>
              <button
                onClick={() => onCadenceChange(4)}
                disabled={cadenceUpdating}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  cadence === 4
                    ? "text-white shadow-sm cursor-default"
                    : "text-gray-500 hover:text-gray-700 cursor-pointer"
                } ${cadenceUpdating ? "opacity-50" : ""}`}
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
        {rounds.map((round) => {
          if (round.status === "in_progress") {
            const responded = round.responses_completed || 0;
            const invited = round.members_invited || 0;
            const progress = invited > 0 ? Math.round((responded / invited) * 100) : 0;
            const days = daysRemaining(round.closes_at);

            return (
              <div key={round.id} className="bg-gray-50 rounded-lg overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getCircleColor(round.status)}`}>
                    {round.round_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">Round {round.round_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(round.status)}`}>
                        {getStatusLabel(round.status)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Launched {formatDate(round.launched_at)} &middot; Closes {formatDate(round.closes_at)}
                      {days !== null && ` (${days} day${days !== 1 ? "s" : ""} remaining)`}
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-4">
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 font-medium">{responded} of {invited} responses</span>
                      <span className="text-gray-500">{progress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${progress}%`, backgroundColor: "var(--cam-blue)" }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/admin/rounds/${round.id}`)}
                      className="flex-1 py-2 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      View Dashboard
                    </button>
                    {confirmClose === round.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCloseRound(round.id)}
                          disabled={closingRound === round.id}
                          className="py-2 px-3 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                        >
                          {closingRound === round.id ? "Closing..." : "Yes, Close"}
                        </button>
                        <button
                          onClick={() => setConfirmClose(null)}
                          className="py-2 px-3 text-sm font-semibold text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClose(round.id)}
                        className="py-2 px-3 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Close Early
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={round.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getCircleColor(round.status)}`}>
                {round.round_number}
              </div>
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
                  {round.status === "concluded" && (
                    <span>
                      Concluded {formatDate(round.concluded_at)} &middot; {round.responses_completed || 0}/{round.members_invited || 0} responses
                    </span>
                  )}
                </div>
              </div>

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
          );
        })}
      </div>

      {reInterviewPrompt && (
        <ReInterviewDialog
          lastInterviewDate={reInterviewPrompt.lastInterviewDate}
          interviewSummary={reInterviewPrompt.interviewSummary}
          roundId={reInterviewPrompt.roundId}
          onSkip={() => { setReInterviewPrompt(null); handleLaunch(reInterviewPrompt.roundId); }}
          onClose={() => setReInterviewPrompt(null)}
        />
      )}
    </div>
  );
}
