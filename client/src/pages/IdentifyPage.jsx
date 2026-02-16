import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function IdentifyPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [incompleteSession, setIncompleteSession] = useState(null);
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      // Validate email against user database
      const validateRes = await fetch(`/api/users/validate?email=${encodeURIComponent(email)}`);
      const validateData = await validateRes.json();

      if (!validateData.valid) {
        setError("Email not found. Please contact your property manager.");
        setLoading(false);
        return;
      }

      const user = validateData.user;
      setUserData(user);

      // Check for incomplete session
      const incompleteRes = await fetch(`/api/sessions/incomplete/${encodeURIComponent(email)}`);
      const incompleteData = await incompleteRes.json();

      if (incompleteData.session) {
        // Found an incomplete session - prompt user
        setIncompleteSession(incompleteData.session);
        setShowResumePrompt(true);
        setLoading(false);
        return;
      }

      // No incomplete session - create new one
      await createNewSession(user);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const createNewSession = async (user) => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          user_id: user.id,
          community_name: user.community_name,
          management_company: user.management_company,
        }),
      });
      const session = await res.json();
      if (!res.ok) throw new Error(session.error);
      if (!session || !session.id) throw new Error("Failed to create session");

      navigate("/chat", {
        state: {
          sessionId: session.id,
          email,
          communityName: user.community_name || null,
          managementCompany: user.management_company || null,
        },
      });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleResumeSession = () => {
    navigate("/chat", {
      state: {
        sessionId: incompleteSession.id,
        email,
        communityName: userData.community_name || null,
        managementCompany: userData.management_company || null,
      },
    });
  };

  const handleStartFresh = async () => {
    setLoading(true);
    try {
      // Delete the incomplete session
      await fetch(`/api/sessions/${incompleteSession.id}`, {
        method: "DELETE",
      });

      // Create new session
      await createNewSession(userData);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
      setShowResumePrompt(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Hero background image with overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/hero-community.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900/85 via-gray-900/75 to-gray-800/80" />
      </div>

      <div className="relative flex flex-col lg:flex-row items-center justify-center min-h-screen px-4 py-8 gap-8 lg:gap-16 max-w-6xl mx-auto">

        {/* Left: Why your voice matters */}
        <div className="flex-1 max-w-lg text-center lg:text-left">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2">
            ResidentPulse
          </h1>
          <a href="https://camascent.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center lg:justify-start gap-2 mb-6 text-white/70 hover:text-white/90 transition-colors">
            <span className="text-base font-medium">Powered by</span>
            <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
            <span className="text-base font-semibold">CAM Ascent Analytical Insights</span>
          </a>
          <h2 className="text-xl lg:text-3xl font-bold text-white leading-tight mb-3 lg:mb-4">
            Your voice shapes your community.
          </h2>
          <p className="hidden lg:block text-white/80 text-lg mb-6">
            As a board member, you have a unique perspective on what's working
            and what could be better. This short conversation helps your management
            company understand your priorities and take meaningful action.
          </p>
          <p className="lg:hidden text-white/80 text-sm mb-4">
            Your perspective as a board member matters. This quick conversation
            helps improve services for your community.
          </p>

          <div className="space-y-3 lg:space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Quick & Conversational</p>
                <p className="text-white/60 text-sm hidden lg:block">Not a boring form — a friendly chat that takes just a few minutes.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Your Feedback Drives Change</p>
                <p className="text-white/60 text-sm hidden lg:block">Responses are reviewed by your management team and used to improve services for your community.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Confidential & Secure</p>
                <p className="text-white/60 text-sm hidden lg:block">Your individual responses are never shared publicly — only aggregated insights reach the team.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Email entry card */}
        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to share your feedback?</h2>
            <p className="text-sm text-gray-500 mb-6">Enter your email to start a quick conversation about your community experience.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="board.member@example.com"
                  className="input-field"
                  autoFocus
                />
              </div>

              {error && <p className="text-red-600 text-base font-medium">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary mt-2"
              >
                {loading ? "Verifying..." : "Start Feedback Session"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Resume Session Modal */}
      {showResumePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center px-6 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Resume Previous Session?</h2>
            <p className="text-gray-600 mb-6">
              We found an incomplete feedback session from your previous visit. Would you like to continue where you left off, or start a fresh session?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleResumeSession}
                disabled={loading}
                className="flex-1 py-3 font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                Resume Session
              </button>
              <button
                onClick={handleStartFresh}
                disabled={loading}
                className="flex-1 py-3 font-semibold text-gray-700 bg-gray-100 rounded-lg transition hover:bg-gray-200 disabled:opacity-50"
              >
                {loading ? "Starting..." : "Start Fresh"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
