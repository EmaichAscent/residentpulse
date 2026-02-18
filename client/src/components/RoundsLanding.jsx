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
  const [interviewCompleted, setInterviewCompleted] = useState(false);

  useEffect(() => {
    loadRounds();
    loadAccount();
    loadInterviewStatus();
  }, []);

  const loadInterviewStatus = async () => {
    try {
      const res = await fetch("/api/admin/interview/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setInterviewCompleted(data.hasCompletedInterview);
      }
    } catch (err) {
      console.error("Failed to load interview status:", err);
    }
  };

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

  // Build welcome greeting
  const welcomeName = user?.first_name
    ? `${user.first_name}${user.company_name ? ` — ${user.company_name}` : ""}`
    : user?.company_name || null;

  // No rounds at all — show launch checklist + philosophy
  if (rounds.length === 0) {
    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome{welcomeName ? `, ${welcomeName}` : ""}!
          </h2>
          <p className="text-gray-500 mt-1">Let's get your first survey round live.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column — Launch Checklist */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Get Live in 3 Steps</h3>

            {/* Step 1: AI Interview */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                {interviewCompleted ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                    1
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Tell Us About Your Business</p>
                {interviewCompleted ? (
                  <p className="text-sm text-green-600 font-medium mt-0.5">Completed</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mt-0.5">A quick conversation with our AI so we can personalize your board member interviews.</p>
                    <button
                      onClick={() => navigate("/admin/onboarding")}
                      className="mt-2 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      Start Interview
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 2: Add Members */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                {memberCount > 0 ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                    2
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Add Your Members</p>
                {memberCount > 0 ? (
                  <p className="text-sm text-green-600 font-medium mt-0.5">{memberCount} member{memberCount !== 1 ? "s" : ""} added</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mt-0.5">Load your board members so they can receive survey invitations.</p>
                    <button
                      onClick={() => navigate("/admin/members")}
                      className="mt-2 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      Add Members
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 3: Schedule First Round */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-0.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${memberCount > 0 ? "text-white" : "bg-gray-200 text-gray-400"}`} style={memberCount > 0 ? { backgroundColor: "var(--cam-blue)" } : {}}>
                  3
                </div>
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${memberCount > 0 ? "text-gray-900" : "text-gray-400"}`}>Schedule Your First Round</p>
                {memberCount > 0 ? (
                  <div className="mt-2">
                    <SurveySchedule />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5">Add members first to unlock scheduling.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column — Philosophy */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-5">How ResidentPulse Works</h3>

            <div className="space-y-5">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: "rgba(59, 159, 231, 0.1)" }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">AI-Powered Interviews</p>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
                    Each board member has a brief, personalized conversation with our AI trained in community management. No generic surveys — real dialogue that surfaces what matters.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: "rgba(26, 176, 110, 0.1)" }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-green)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Consistency Is Key</p>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
                    30-day rounds, one per member. The more consistently you run rounds, the more powerful your insights become. Track sentiment trends over time.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: "rgba(59, 159, 231, 0.1)" }}>
                  <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Minimal Effort, Maximum Impact</p>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
                    Set your schedule, add members, launch. The AI handles the interviews, and ResidentPulse handles the analysis. We handle the rest.
                  </p>
                </div>
              </div>
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
