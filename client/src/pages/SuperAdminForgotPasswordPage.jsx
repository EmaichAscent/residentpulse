import { useState } from "react";
import { Link } from "react-router-dom";

export default function SuperAdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/superadmin/forgot-password", {
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
    <div className="min-h-screen relative">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/hero-community.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900/85 via-gray-900/75 to-gray-800/80" />
      </div>

      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2">
            ResidentPulse
          </h1>
          <a href="https://camascent.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 text-white/70 hover:text-white/90 transition-colors">
            <span className="text-base font-medium">Powered by</span>
            <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
            <span className="text-base font-semibold">CAM Ascent Analytical Insights</span>
          </a>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Reset Password</h2>
            <p className="text-base text-gray-500 mb-6">SuperAdmin Portal</p>

            {submitted ? (
              <div>
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-700">
                    If an account exists with that email, you'll receive a password reset link shortly. Check your inbox.
                  </p>
                </div>
                <Link
                  to="/superadmin/login"
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
                  <label htmlFor="email" className="block text-base font-medium text-gray-700 mb-2">
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
                  to="/superadmin/login"
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
    </div>
  );
}
