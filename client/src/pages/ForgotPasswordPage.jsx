import { useState } from "react";
import { Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: "linear-gradient(135deg, #3B9FE7 0%, #1AB06E 100%)" }}>
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/CAMAscent.png"
            alt="CAM Ascent"
            className="w-80 mx-auto mb-6 object-contain drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold text-white tracking-wide">ResidentPulse</h1>
          <p className="text-white/70 mt-1 text-sm">Reset Your Password</p>
        </div>

        {/* Card */}
        <div className="bg-white shadow-2xl rounded-2xl p-8">
          {submitted ? (
            <div>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">
                  If an account exists with that email, you'll receive a password reset link shortly. Check your inbox.
                </p>
              </div>
              <Link
                to="/admin/login"
                className="block text-center text-sm hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-sm text-gray-600 mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@example.com"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <Link
                to="/admin/login"
                className="block text-center text-sm hover:underline mt-4"
                style={{ color: "var(--cam-blue)" }}
              >
                Back to login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
