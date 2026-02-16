import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import InterviewChat from "../components/InterviewChat";

const COMPANY_SIZES = [
  "1-5 employees",
  "6-15 employees",
  "16-50 employees",
  "51-100 employees",
  "100+ employees"
];

const YEARS_OPTIONS = [
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5-10 years",
  "10-20 years",
  "20+ years"
];

const STEPS = [
  { key: "form", label: "Company Info" },
  { key: "chat", label: "AI Interview" },
  { key: "confirm", label: "Review" },
];

export default function AdminOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const interviewType = searchParams.get("type") === "re_interview" ? "re_interview" : "initial";

  const [step, setStep] = useState("form");
  const [interviewId, setInterviewId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [user, setUser] = useState(null);

  const [companySize, setCompanySize] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [geographicArea, setGeographicArea] = useState("");
  const [communitiesManaged, setCommunitiesManaged] = useState("");
  const [competitiveAdvantages, setCompetitiveAdvantages] = useState("");

  useEffect(() => {
    checkAuthAndResume();
  }, []);

  const checkAuthAndResume = async () => {
    try {
      const authRes = await fetch("/api/auth/status", { credentials: "include" });
      const authData = await authRes.json();
      if (!authData.authenticated || authData.user.role !== "client_admin") {
        navigate("/admin/login");
        return;
      }
      setUser(authData.user);

      const statusRes = await fetch("/api/admin/interview/status", { credentials: "include" });
      const statusData = await statusRes.json();

      if (statusData.activeInterviewId) {
        const interviewRes = await fetch(`/api/admin/interview/${statusData.activeInterviewId}`, { credentials: "include" });
        const interviewData = await interviewRes.json();

        setInterviewId(statusData.activeInterviewId);

        if (interviewData.interview.company_size) {
          setCompanySize(interviewData.interview.company_size || "");
          setYearsInBusiness(interviewData.interview.years_in_business || "");
          setGeographicArea(interviewData.interview.geographic_area || "");
          setCommunitiesManaged(interviewData.interview.communities_managed?.toString() || "");
          setCompetitiveAdvantages(interviewData.interview.competitive_advantages || "");

          if (interviewData.messages.length > 0) {
            setChatMessages(interviewData.messages.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.created_at
            })));
            setStep("chat");
          }
        }
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      navigate("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let id = interviewId;
      if (!id) {
        const createRes = await fetch("/api/admin/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ interview_type: interviewType }),
        });
        const createData = await createRes.json();
        id = createData.interview_id;
        setInterviewId(id);
      }

      const res = await fetch(`/api/admin/interview/${id}/structured`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_size: companySize,
          years_in_business: yearsInBusiness,
          geographic_area: geographicArea,
          communities_managed: communitiesManaged ? Number(communitiesManaged) : null,
          competitive_advantages: competitiveAdvantages,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setChatMessages([
        { role: "assistant", content: data.message, timestamp: new Date().toISOString() }
      ]);
      setStep("chat");
    } catch (err) {
      console.error("Form submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSummaryDetected = (aiMessage) => {
    setSummaryMessage(aiMessage);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/admin/interview/${interviewId}/confirm`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmResult(data);
    } catch (err) {
      console.error("Confirm error:", err);
    } finally {
      setConfirming(false);
    }
  };

  const handleAddMore = () => {
    setStep("chat");
    setSummaryMessage("");
  };

  const handleSkip = async () => {
    if (interviewId) {
      await fetch(`/api/admin/interview/${interviewId}/abandon`, {
        method: "PATCH",
        credentials: "include",
      });
    }
    navigate("/admin");
  };

  const handleEndEarly = async () => {
    try {
      const res = await fetch(`/api/admin/interview/${interviewId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: "I'd like to wrap up. Can you summarize what we've discussed?" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSummaryMessage(data.message);
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: "I'd like to wrap up. Can you summarize what we've discussed?", timestamp: new Date().toISOString() },
          { role: "assistant", content: data.message, timestamp: new Date().toISOString() },
        ]);
        setStep("confirm");
      }
    } catch (err) {
      console.error("End early error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Success screen
  if (confirmResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Profile Complete!</h2>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            Your company profile has been saved. Our AI interviewer will now use this context
            to have more relevant, personalized conversations with your board members.
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="btn-primary-sm px-8"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="shadow-sm flex-shrink-0" style={{ backgroundColor: "var(--cam-blue)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-white">
              {interviewType === "re_interview" ? "Company Check-In" : "Company Profile Setup"}
            </h1>
            <p className="text-xs text-white/60">{user?.company_name}</p>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-white/50 hover:text-white/80 transition"
          >
            Do this later
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${i <= stepIndex ? "bg-blue-400" : "bg-gray-200"}`} />}
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  i < stepIndex ? "bg-blue-500 text-white" :
                  i === stepIndex ? "bg-blue-500 text-white" :
                  "bg-gray-200 text-gray-400"
                }`}>
                  {i < stepIndex ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  i <= stepIndex ? "text-gray-700" : "text-gray-400"
                }`}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step: Structured Form */}
      {step === "form" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            {/* Preamble */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src="/camascent-chat-icon.png"
                  alt="CAM Ascent"
                  className="w-10 h-10 rounded-full object-contain bg-white border border-gray-200 flex-shrink-0"
                />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {interviewType === "re_interview"
                      ? "Let's catch up on what's changed"
                      : "Help our AI understand your business"}
                  </h2>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-gray-700 leading-relaxed space-y-2">
                <p>
                  <strong>Why this matters:</strong> When our AI interviews your board members,
                  it needs to understand the unique context of your management company — your size,
                  your market, what makes you different.
                </p>
                <p>
                  Without this, every board gets the same generic questions. With it, the AI can ask
                  about the things that actually matter to <em>your</em> communities and surface insights
                  that are specific to how you operate.
                </p>
                <p className="text-gray-500 text-xs">
                  This takes about 5 minutes. You'll answer a few quick questions below, then have a
                  brief conversation with our AI to fill in the details.
                </p>
              </div>
            </div>

            {/* Form card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company Size</label>
                    <select
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="input-field-sm"
                      required
                    >
                      <option value="">Select...</option>
                      {COMPANY_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Years in Business</label>
                    <select
                      value={yearsInBusiness}
                      onChange={(e) => setYearsInBusiness(e.target.value)}
                      className="input-field-sm"
                      required
                    >
                      <option value="">Select...</option>
                      {YEARS_OPTIONS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Geographic Area</label>
                    <input
                      type="text"
                      value={geographicArea}
                      onChange={(e) => setGeographicArea(e.target.value)}
                      placeholder="e.g., South Florida"
                      className="input-field-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Communities Managed</label>
                    <input
                      type="number"
                      value={communitiesManaged}
                      onChange={(e) => setCommunitiesManaged(e.target.value)}
                      placeholder="e.g., 25"
                      min="1"
                      className="input-field-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">What sets your company apart?</label>
                  <textarea
                    value={competitiveAdvantages}
                    onChange={(e) => setCompetitiveAdvantages(e.target.value)}
                    placeholder="e.g., Technology-forward approach, dedicated community managers, strong financial reporting..."
                    rows={2}
                    className="input-field-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary-sm w-full"
                >
                  {submitting ? "Starting interview..." : "Continue to AI Interview"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Step: Chat */}
      {step === "chat" && interviewId && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-4 min-h-0">
          <InterviewChat
            interviewId={interviewId}
            initialMessages={chatMessages}
            onComplete={handleSummaryDetected}
            onEndEarly={handleEndEarly}
          />
        </div>
      )}

      {/* Step: Confirmation */}
      {step === "confirm" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Does this look right?</h2>
              <p className="text-xs text-gray-500 mb-4">
                Here's what our AI captured. Once confirmed, this context will be used to personalize
                board member interviews. You won't need to edit this manually.
              </p>

              <div className="bg-gray-50 rounded-lg p-4 mb-5 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {summaryMessage}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex-1 btn-primary-sm"
                >
                  {confirming ? "Saving..." : "Yes, looks good"}
                </button>
                <button
                  onClick={handleAddMore}
                  disabled={confirming}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Let me add more
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
