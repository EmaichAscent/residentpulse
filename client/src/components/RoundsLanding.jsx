import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import SurveySchedule from "./SurveySchedule";
import { COLORS, npsColor } from "../utils/npsHelpers";

export default function RoundsLanding() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingRound, setClosingRound] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [cadence, setCadence] = useState(null);
  const [maxCadence, setMaxCadence] = useState(null);
  const [cadenceUpdating, setCadenceUpdating] = useState(false);
  const [cadenceMessage, setCadenceMessage] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [memberLimit, setMemberLimit] = useState(null);

  useEffect(() => {
    loadRounds();
    loadAccount();
  }, []);

  const loadAccount = async () => {
    try {
      const res = await fetch("/api/admin/account", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCadence(data.subscription?.survey_cadence || 2);
        setMaxCadence(data.subscription?.survey_rounds_per_year || 2);
        setMemberCount(data.usage?.member_count || 0);
        setMemberLimit(data.subscription?.member_limit || null);
      }
    } catch (err) {
      console.error("Failed to load account:", err);
    }
  };

  const loadRounds = async () => {
    try {
      const res = await fetch("/api/admin/survey-rounds", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRounds(data);
      }
    } catch (err) {
      console.error("Failed to load rounds:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCadenceChange = async (newCadence) => {
    if (newCadence === cadence || cadenceUpdating) return;
    setCadenceUpdating(true);
    setCadenceMessage(null);
    try {
      const res = await fetch("/api/admin/account/cadence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ survey_cadence: newCadence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCadence(newCadence);
      setCadenceMessage(data.message);
      await loadRounds();
      setTimeout(() => setCadenceMessage(null), 8000);
    } catch (err) {
      setCadenceMessage(err.message);
      setTimeout(() => setCadenceMessage(null), 8000);
    } finally {
      setCadenceUpdating(false);
    }
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

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysRemaining = (closesAt) => {
    if (!closesAt) return null;
    const diff = new Date(closesAt) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading rounds...</p>;
  }

  const activeRounds = rounds.filter((r) => r.status === "in_progress");
  const completedRounds = rounds.filter((r) => r.status === "concluded");
  const plannedRounds = rounds.filter((r) => r.status === "planned");

  // No rounds at all — show welcome + scheduling
  if (rounds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-gradient px-8 py-10 text-center">
            <h2 className="text-3xl font-bold text-white mb-2">
              Welcome{user?.company_name ? `, ${user.company_name}` : ""}!
            </h2>
            <p className="text-white/80 text-lg max-w-xl mx-auto">
              Get started by setting up your survey schedule and adding board members.
            </p>
          </div>
          <div className="px-8 py-6">
            <SurveySchedule />
            <div className="mt-4 text-center">
              <button
                onClick={() => navigate("/admin/members")}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90 text-white"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                Add Board Members
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Rounds */}
      {activeRounds.map((round) => {
        const responded = round.responses_completed || 0;
        const invited = round.members_invited || 0;
        const progress = invited > 0 ? Math.round((responded / invited) * 100) : 0;
        const days = daysRemaining(round.closes_at);

        return (
          <div
            key={round.id}
            className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between" style={{ backgroundColor: "rgba(59, 159, 231, 0.05)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                  {round.round_number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Round {round.round_number}</h3>
                  <p className="text-xs text-gray-500">
                    Launched {formatDate(round.launched_at)} &middot; Closes {formatDate(round.closes_at)}
                    {days !== null && ` (${days} day${days !== 1 ? "s" : ""} remaining)`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {round.active_alert_count > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    {round.active_alert_count} Warning{round.active_alert_count !== 1 ? "s" : ""} in {round.alert_community_count} Communit{round.alert_community_count !== 1 ? "ies" : "y"}
                  </span>
                )}
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                  In Progress
                </span>
              </div>
            </div>

            <div className="px-6 py-4">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 font-medium">{responded} of {invited} responses</span>
                  <span className="text-gray-500">{progress}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: "var(--cam-blue)",
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/admin/rounds/${round.id}`)}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                  style={{ backgroundColor: "var(--cam-blue)" }}
                >
                  View Dashboard
                </button>
                {confirmClose === round.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCloseRound(round.id)}
                      disabled={closingRound === round.id}
                      className="py-2.5 px-4 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                      {closingRound === round.id ? "Closing..." : "Yes, Close"}
                    </button>
                    <button
                      onClick={() => setConfirmClose(null)}
                      className="py-2.5 px-4 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClose(round.id)}
                    className="py-2.5 px-4 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close Early
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Completed Rounds */}
      {completedRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Completed Rounds
          </h3>
          <div className="space-y-3">
            {completedRounds.map((round) => {
              const responded = round.responses_completed || 0;
              const invited = round.members_invited || 0;
              const rate = invited > 0 ? Math.round((responded / invited) * 100) : 0;

              return (
                <div
                  key={round.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:border-gray-300 transition cursor-pointer"
                  onClick={() => navigate(`/admin/rounds/${round.id}`)}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: "var(--cam-green)" }}>
                    {round.round_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-gray-900">Round {round.round_number}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Concluded
                      </span>
                      {round.active_alert_count > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          {round.active_alert_count} Warning{round.active_alert_count !== 1 ? "s" : ""}
                        </span>
                      )}
                      {round.insights_generated_at && (
                        <span className="text-xs text-gray-400" title="AI insights available">
                          <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(round.launched_at)} — {formatDate(round.concluded_at)} &middot; {responded}/{invited} responses ({rate}%)
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Planned Rounds */}
      {plannedRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Upcoming Rounds
          </h3>
          <SurveySchedule
            cadence={cadence}
            maxCadence={maxCadence}
            onCadenceChange={handleCadenceChange}
            cadenceUpdating={cadenceUpdating}
            cadenceMessage={cadenceMessage}
          />
        </div>
      )}

      {/* Member Limit Warning */}
      {memberLimit && memberCount > memberLimit && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">Board member limit exceeded</p>
              <p className="text-sm text-amber-700 mt-0.5">
                You have {memberCount} board members but your plan supports {memberLimit}. New survey rounds cannot be launched until you're within your plan limit. Remove inactive board members or upgrade your plan.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
