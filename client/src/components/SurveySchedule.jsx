import { useState, useEffect, useRef, useCallback } from "react";
import ReInterviewDialog from "./ReInterviewDialog";

export default function SurveySchedule({
  cadence,
  maxCadence,
  onCadenceChange,
  cadenceUpdating,
  cadenceMessage,
  embedded,
  onScheduled,
}) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstDate, setFirstDate] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [launching, setLaunching] = useState(null);
  const [confirmLaunch, setConfirmLaunch] = useState(null);
  const [error, setError] = useState(null);
  const [reInterviewPrompt, setReInterviewPrompt] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const pollRef = useRef(null);

  const handleSaveDate = async (roundId) => {
    if (!editDateValue) return;
    setSavingDate(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scheduled_date: editDateValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reschedule");
      setEditingDateId(null);
      await loadRounds();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDate(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (jobId) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/admin/survey-rounds/email-jobs/${jobId}`, {
            credentials: "include",
          });
          if (!res.ok) return;
          const job = await res.json();
          setActiveJob((prev) => ({ ...prev, ...job }));
          if (job.status !== "in_progress") {
            stopPolling();
            loadRounds();
          }
        } catch {
          // Polling error — ignore, will retry next interval
        }
      }, 3000);
    },
    [stopPolling]
  );

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Check for active job on mount (page load resume)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/survey-rounds/email-jobs/active", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.job) {
            setActiveJob(data.job);
            startPolling(data.job.id);
          }
        }
      } catch {
        // Ignore
      }
    })();
  }, [startPolling]);

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
        body: JSON.stringify({ first_launch_date: firstDate }),
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
    setConfirmLaunch(null);
    // Check if a re-interview should be offered before launching
    try {
      const res = await fetch("/api/admin/interview/status", { credentials: "include" });
      const data = await res.json();

      if (data.hasCompletedInterview && data.lastInterviewDate) {
        const daysSince = Math.floor(
          (Date.now() - new Date(data.lastInterviewDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince < 60) {
          // Recent interview — skip dialog, launch directly
          handleLaunch(roundId);
          return;
        }
        setReInterviewPrompt({
          roundId,
          lastInterviewDate: data.lastInterviewDate,
          interviewSummary: data.interviewSummary,
        });
        return;
      }
    } catch {
      // If check fails, just proceed with launch
    }
    handleLaunch(roundId);
  };

  const handleLaunch = async (roundId) => {
    setLaunching(roundId);
    setConfirmLaunch(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        // API returns immediately — start polling for progress
        setActiveJob({
          id: data.job_id,
          status: "in_progress",
          total_count: data.total,
          sent_count: 0,
          failed_count: 0,
          closes_at: data.closes_at,
        });
        startPolling(data.job_id);
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
      return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "concluded":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "in_progress":
        return "In Progress";
      case "concluded":
        return "Concluded";
      default:
        return "Planned";
    }
  };

  const getCircleColor = (status) => {
    switch (status) {
      case "in_progress":
        return "bg-[var(--cam-blue)] text-white";
      case "concluded":
        return "bg-[var(--cam-green)] text-white";
      default:
        return "bg-gray-200 text-gray-500";
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-6">Loading survey schedule...</p>;
  }

  // No rounds yet — show setup
  if (rounds.length === 0) {
    const Wrapper = embedded
      ? "div"
      : ({ children }) => <div className="bg-white rounded-xl border p-6">{children}</div>;

    return (
      <Wrapper>
        {!embedded && (
          <>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Schedule Your First Survey Round
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Pick a launch date for your first survey round. We'll calculate the rest of your
              schedule based on your cadence settings.
            </p>
          </>
        )}

        {embedded ? (
          <>
            <p className="text-xs text-gray-500 mb-3">
              All current board members will be invited when you launch.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First Launch Date
              </label>
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
                Make sure your board member list is up to date before scheduling. Once you confirm
                and launch a round, all current board members will receive a survey invitation.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Launch Date
              </label>
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
        {onCadenceChange && (
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
                disabled={cadenceUpdating || maxCadence < 4}
                title={maxCadence < 4 ? "Upgrade your plan to unlock 4x/year" : ""}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                  cadence === 4
                    ? "text-white shadow-sm cursor-default"
                    : maxCadence < 4
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-500 hover:text-gray-700 cursor-pointer"
                } ${cadenceUpdating ? "opacity-50" : ""}`}
                style={cadence === 4 ? { backgroundColor: "var(--cam-green)" } : {}}
              >
                4x/yr
              </button>
            </div>
            {cadenceUpdating && <span className="text-xs text-gray-400">Updating...</span>}
          </div>
        )}
      </div>

      {cadenceMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">{cadenceMessage}</p>
        </div>
      )}

      {activeJob && activeJob.status === "in_progress" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-blue-800">
              Sending invitations... {activeJob.sent_count} of {activeJob.total_count} sent
              {activeJob.failed_count > 0 && (
                <span className="text-red-600 ml-1">({activeJob.failed_count} failed)</span>
              )}
            </p>
            <span className="text-xs text-blue-500">
              {Math.round(
                ((activeJob.sent_count + activeJob.failed_count) / activeJob.total_count) * 100
              )}
              %
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(((activeJob.sent_count + activeJob.failed_count) / activeJob.total_count) * 100)}%`,
                backgroundColor: "var(--cam-blue)",
              }}
            />
          </div>
        </div>
      )}

      {activeJob && activeJob.status === "completed" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-green-800">
            Round launched! {activeJob.sent_count} invitation{activeJob.sent_count !== 1 ? "s" : ""}{" "}
            sent
            {activeJob.failed_count > 0 && `, ${activeJob.failed_count} failed`}.
            {activeJob.closes_at && ` Survey closes ${formatDate(activeJob.closes_at)}.`}
          </p>
          <button
            onClick={() => setActiveJob(null)}
            className="text-xs text-green-600 hover:text-green-800 font-medium ml-3 flex-shrink-0"
          >
            Done
          </button>
        </div>
      )}

      {activeJob && activeJob.status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-red-800">
            Email sending failed: {activeJob.error_message || "Unknown error"}.
            {activeJob.sent_count > 0 &&
              ` ${activeJob.sent_count} of ${activeJob.total_count} sent before failure.`}
          </p>
          <button
            onClick={() => setActiveJob(null)}
            className="text-xs text-red-600 hover:text-red-800 font-medium ml-3 flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {rounds
          .filter((r) => r.status === "planned")
          .map((round) => {
            return (
              <div key={round.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getCircleColor(round.status)}`}
                >
                  {round.round_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">Round {round.round_number}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(round.status)}`}
                    >
                      {getStatusLabel(round.status)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {editingDateId === round.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="date"
                          value={editDateValue}
                          onChange={(e) => setEditDateValue(e.target.value)}
                          className="text-sm px-2 py-1 border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => handleSaveDate(round.id)}
                          disabled={savingDate}
                          className="text-xs px-3 py-1 bg-[var(--cam-blue)] text-white rounded font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {savingDate ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingDateId(null)}
                          className="text-xs px-3 py-1 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>Scheduled for {formatDate(round.scheduled_date)}</span>
                        <button
                          onClick={() => {
                            setEditingDateId(round.id);
                            setEditDateValue(round.scheduled_date?.split("T")[0] || "");
                          }}
                          className="ml-2 text-xs text-[var(--cam-blue)] hover:underline font-medium"
                        >
                          Change
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {(() => {
                  const jobInProgress = activeJob?.status === "in_progress";
                  const anotherRoundActive = rounds.some((r) => r.status === "in_progress");

                  return (
                    <button
                      onClick={() => setConfirmLaunch(round.id)}
                      disabled={jobInProgress || anotherRoundActive}
                      title={anotherRoundActive ? "Another round is currently in progress" : ""}
                      className="text-sm px-4 py-2 bg-[var(--cam-blue)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {jobInProgress ? "Sending..." : "Launch Now"}
                    </button>
                  );
                })()}
              </div>
            );
          })}
      </div>

      {reInterviewPrompt && (
        <ReInterviewDialog
          lastInterviewDate={reInterviewPrompt.lastInterviewDate}
          interviewSummary={reInterviewPrompt.interviewSummary}
          roundId={reInterviewPrompt.roundId}
          onSkip={() => {
            setReInterviewPrompt(null);
            handleLaunch(reInterviewPrompt.roundId);
          }}
          onClose={() => setReInterviewPrompt(null)}
        />
      )}

      {confirmLaunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Launch Survey Now?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to launch this survey round now? Invitations will be sent to all
              active members immediately.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmLaunch(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePreLaunchCheck(confirmLaunch)}
                disabled={launching === confirmLaunch}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {launching === confirmLaunch ? "Launching..." : "Yes, Launch Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
