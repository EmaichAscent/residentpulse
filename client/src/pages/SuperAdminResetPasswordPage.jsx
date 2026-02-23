import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function SuperAdminResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
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
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">Invalid reset link. No token provided.</p>
              </div>
              <Link
                to="/superadmin/forgot-password"
                className="block text-center text-sm hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                Request a new reset link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/superadmin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(true);
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
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Set New Password</h2>
            <p className="text-base text-gray-500 mb-6">SuperAdmin Portal</p>

            {success ? (
              <div>
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-700">
                    Your password has been reset successfully.
                  </p>
                </div>
                <Link
                  to="/superadmin/login"
                  className="block text-center w-full btn-primary"
                >
                  Go to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="password" className="block text-base font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    autoFocus
                    minLength={8}
                  />
                  <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
                </div>

                <div className="mb-6">
                  <label htmlFor="confirmPassword" className="block text-base font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                    {error.includes("expired") && (
                      <Link
                        to="/superadmin/forgot-password"
                        className="text-sm hover:underline mt-1 block"
                        style={{ color: "var(--cam-blue)" }}
                      >
                        Request a new reset link
                      </Link>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary"
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
