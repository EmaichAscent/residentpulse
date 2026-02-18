import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ClientAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPendingVerification(false);
    setResendStatus("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.pending_verification) {
          setPendingVerification(true);
        }
        throw new Error(data.error || "Login failed");
      }

      // Redirect to admin dashboard
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendStatus("sending");
    try {
      const response = await fetch("/api/signup/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
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

      <div className="relative min-h-screen flex flex-col lg:flex-row items-center justify-center px-4 py-8 gap-8 lg:gap-16 max-w-6xl mx-auto">

        {/* Left: Marketing */}
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
            The feedback tool that helps you retain communities and grow your reputation.
          </h2>
          <p className="hidden lg:block text-white/80 text-lg mb-8">
            ResidentPulse gives HOA management companies direct insight into
            board member satisfaction — so you can improve service, prevent
            surprises at renewal time, and prove your value with data.
          </p>
          <p className="lg:hidden text-white/80 text-base mb-4">
            Direct insight into board member satisfaction — improve service,
            prevent surprises, and prove your value with data.
          </p>

          {/* Free trial CTA — visible early on mobile */}
          <div className="mb-6 lg:hidden">
            <Link
              to="/admin/signup"
              className="inline-block w-full text-center px-8 py-3 rounded-lg text-white font-bold text-lg shadow-lg"
              style={{ backgroundColor: "var(--cam-green)" }}
            >
              Start Your Free Trial
            </Link>
            <p className="text-white/50 text-xs mt-2 text-center">No credit card required. Free for up to 25 board members.</p>
          </div>

          <div className="space-y-3 lg:space-y-4 mb-6 lg:mb-8">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Survey Board Members Directly</p>
                <p className="text-white/60 text-sm hidden lg:block">Automated NPS rounds on your schedule — we invite, remind, and collect responses so your team doesn't have to.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">AI That Reads Between the Lines</p>
                <p className="text-white/60 text-sm hidden lg:block">Our AI analyzes open-ended feedback and surfaces what boards actually care about — so you can act before issues escalate.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Retain More Communities</p>
                <p className="text-white/60 text-sm hidden lg:block">Spot dissatisfaction early, demonstrate responsiveness, and turn renewals into a formality.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm lg:text-base">Build Your Reputation With Data</p>
                <p className="text-white/60 text-sm hidden lg:block">Share NPS scores with prospective clients to stand out from competitors who are just guessing.</p>
              </div>
            </div>
          </div>

          {/* Free trial CTA — desktop only (mobile version shown above) */}
          <div className="hidden lg:block">
            <Link
              to="/admin/signup"
              className="inline-block px-8 py-3 rounded-lg text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
              style={{ backgroundColor: "var(--cam-green)" }}
            >
              Start Your Free Trial
            </Link>
            <p className="text-white/50 text-xs mt-3">No credit card required. Free for up to 25 board members.</p>
          </div>
        </div>

        {/* Right: Login Card */}
        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-base text-gray-500 mb-6">Sign in to your admin dashboard</p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
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

              <div className="mb-6">
                <label htmlFor="password" className="block text-base font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                  {pendingVerification && (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendStatus === "sending" || resendStatus === "sent"}
                      className="mt-2 text-sm font-semibold hover:underline disabled:opacity-50"
                      style={{ color: "var(--cam-blue)" }}
                    >
                      {resendStatus === "sending" ? "Sending..." : resendStatus === "sent" ? "Verification email sent! Check your inbox." : "Resend verification email"}
                    </button>
                  )}
                  {resendStatus === "error" && (
                    <p className="text-sm text-red-500 mt-1">Failed to resend. Please try again.</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary"
              >
                {loading ? "Logging in..." : "Login"}
              </button>

              <div className="text-center mt-4">
                <Link
                  to="/admin/forgot-password"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cam-blue)" }}
                >
                  Forgot your password?
                </Link>
              </div>

              <div className="text-center mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  New to ResidentPulse?{" "}
                  <Link
                    to="/admin/signup"
                    className="font-semibold hover:underline"
                    style={{ color: "var(--cam-green)" }}
                  >
                    Sign up free
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
