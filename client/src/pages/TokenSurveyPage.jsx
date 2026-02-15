import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

export default function TokenSurveyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }

    validateAndCreateSession(token);
  }, [searchParams]);

  async function validateAndCreateSession(token) {
    try {
      // Validate token
      const validationRes = await fetch(`/api/sessions/validate-token/${token}`);

      if (!validationRes.ok) {
        const errorData = await validationRes.json();
        throw new Error(errorData.error || "Invalid or expired invitation token");
      }

      const userData = await validationRes.json();

      // Create session
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userData.email,
          user_id: userData.user_id,
          community_name: userData.community_name,
          management_company: userData.management_company
        })
      });

      if (!sessionRes.ok) {
        const errorData = await sessionRes.json();
        throw new Error(errorData.error || "Failed to create survey session");
      }

      const session = await sessionRes.json();

      // Navigate to chat
      navigate("/chat", {
        state: {
          sessionId: session.id,
          email: userData.email,
          firstName: userData.first_name,
          community: userData.community_name,
          company: userData.management_company
        }
      });

    } catch (err) {
      console.error("Token validation error:", err);
      setError(err.message);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-red-600">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Invitation {error.includes("expired") ? "Expired" : "Invalid"}
          </h1>

          <p className="text-gray-600 mb-6">
            {error.includes("expired")
              ? "Your invitation link has expired. The survey round may have concluded."
              : "This invitation link is invalid or has already been used."}
          </p>

          <p className="text-sm text-gray-500 mb-6">
            Please contact your property manager if you need a new invitation, or you can start the survey by entering your email address.
          </p>

          <Link
            to="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            Go to Survey Home
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
