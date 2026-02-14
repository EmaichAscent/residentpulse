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
    <div className="flex items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/camascent-icon.png" alt="CAM Ascent" className="h-64 mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-bold text-gray-900 mb-3">ResidentPulse</h1>
          <p className="text-lg text-gray-600">
            Help us improve your community experience. Share your feedback in a quick conversation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-lg font-medium text-gray-700 mb-2">
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
