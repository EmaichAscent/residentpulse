import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4"
           style={{ background: "linear-gradient(135deg, #3B9FE7 0%, #1AB06E 100%)" }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <img
              src="/camascent-icon.png"
              alt="CAM Ascent"
              className="h-32 mx-auto mb-6 object-contain drop-shadow-lg"
            />
            <h1 className="text-2xl font-bold text-white tracking-wide">ResidentPulse</h1>
          </div>
          <div className="bg-white shadow-2xl rounded-2xl p-8">
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">Invalid reset link. No token provided.</p>
            </div>
            <Link
              to="/admin/forgot-password"
              className="block text-center text-sm hover:underline"
              style={{ color: "var(--cam-blue)" }}
            >
              Request a new reset link
            </Link>
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
      const response = await fetch("/api/auth/admin/reset-password", {
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
          <p className="text-white/70 mt-1 text-sm">Set New Password</p>
        </div>

        {/* Card */}
        <div className="bg-white shadow-2xl rounded-2xl p-8">
          {success ? (
            <div>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">
                  Your password has been reset successfully.
                </p>
              </div>
              <Link
                to="/admin/login"
                className="block text-center w-full btn-primary"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
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
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
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
                      to="/admin/forgot-password"
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
  );
}
