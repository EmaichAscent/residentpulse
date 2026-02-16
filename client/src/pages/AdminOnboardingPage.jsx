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

export default function AdminOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const interviewType = searchParams.get("type") === "re_interview" ? "re_interview" : "initial";

  const [step, setStep] = useState("form"); // form | chat | confirm
  const [interviewId, setInterviewId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [user, setUser] = useState(null);

  // Structured fields
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
      // Check auth
      const authRes = await fetch("/api/auth/status", { credentials: "include" });
      const authData = await authRes.json();
      if (!authData.authenticated || authData.user.role !== "client_admin") {
        navigate("/admin/login");
        return;
      }
      setUser(authData.user);

      // Check for existing in-progress interview
      const statusRes = await fetch("/api/admin/interview/status", { credentials: "include" });
      const statusData = await statusRes.json();

      if (statusData.activeInterviewId) {
        // Resume existing interview
        const interviewRes = await fetch(`/api/admin/interview/${statusData.activeInterviewId}`, { credentials: "include" });
        const interviewData = await interviewRes.json();

        setInterviewId(statusData.activeInterviewId);

        if (interviewData.interview.company_size) {
          // Structured fields already submitted, resume chat
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
          } else {
            setStep("form");
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
      // Create interview if we don't have one
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

      // Submit structured fields
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

      // Set initial AI message and move to chat
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
    // Ask AI to summarize what it has so far
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
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // Success screen
  if (confirmResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Complete!</h2>
          <p className="text-gray-600 mb-6">
            Thanks for sharing about your company. Our AI will use this context to have better, more
            relevant conversations with your board members. You won't see the details stored — just know
            it's working behind the scenes.
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="btn-primary px-8"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="shadow-sm flex-shrink-0" style={{ backgroundColor: "var(--cam-blue)" }}>
        <div className="max-w-2xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white">
              {interviewType === "re_interview" ? "Company Check-In" : "Company Profile Setup"}
            </h1>
            <p className="text-sm text-white/70">{user?.company_name}</p>
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-white/70 hover:text-white transition"
          >
            Do this later
          </button>
        </div>
      </div>

      {/* Step: Structured Form */}
      {step === "form" && (
        <div className="flex-1 flex items-start justify-center py-8 px-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {interviewType === "re_interview" ? "Let's catch up on your company" : "Tell us about your company"}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              This helps our AI ask better, more relevant questions when surveying your board members.
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select...</option>
                  {COMPANY_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years in Business</label>
                <select
                  value={yearsInBusiness}
                  onChange={(e) => setYearsInBusiness(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select...</option>
                  {YEARS_OPTIONS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Geographic Area Served</label>
                <input
                  type="text"
                  value={geographicArea}
                  onChange={(e) => setGeographicArea(e.target.value)}
                  placeholder="e.g., South Florida, Greater Phoenix Area"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Communities Managed</label>
                <input
                  type="number"
                  value={communitiesManaged}
                  onChange={(e) => setCommunitiesManaged(e.target.value)}
                  placeholder="e.g., 25"
                  min="1"
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What sets your company apart?</label>
                <textarea
                  value={competitiveAdvantages}
                  onChange={(e) => setCompetitiveAdvantages(e.target.value)}
                  placeholder="e.g., Technology-forward approach, dedicated community managers, strong financial reporting..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full"
              >
                {submitting ? "Starting interview..." : "Continue to Interview"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Step: Chat */}
      {step === "chat" && interviewId && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
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
        <div className="flex-1 flex items-start justify-center py-8 px-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Does this look right?</h2>
            <p className="text-sm text-gray-500 mb-4">
              Here's what our AI captured from your interview. Once confirmed, this will be stored
              to help us do a better job surveying your board members. You won't need to edit this manually.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-700 leading-relaxed">
              {summaryMessage}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 btn-primary"
              >
                {confirming ? "Saving..." : "Yes, looks good"}
              </button>
              <button
                onClick={handleAddMore}
                disabled={confirming}
                className="flex-1 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Let me add more
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
