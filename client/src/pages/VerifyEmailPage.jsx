import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Invalid verification link. No token provided.");
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`/api/signup/verify?token=${token}`);
        const data = await res.json();

        if (data.ok) {
          setSuccess(true);
        } else {
          setError(data.error || "Verification failed.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-brand-gradient">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/CAMAscent.png"
            alt="CAM Ascent"
            className="w-80 mx-auto mb-6 object-contain drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold text-white tracking-wide">ResidentPulse</h1>
          <p className="text-white/70 mt-1 text-sm">Email Verification</p>
        </div>

        {/* Card */}
        <div className="bg-white shadow-2xl rounded-2xl p-8">
          {loading ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Verifying your email...</p>
            </div>
          ) : success ? (
            <div>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">
                  Your email has been verified! Your account is now active.
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
            <div>
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
              <Link
                to="/admin/login"
                className="block text-center text-sm hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
