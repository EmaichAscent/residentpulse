import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ClientAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
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
          <img
            src="/CAMAscent.png"
            alt="CAM Ascent"
            className="w-64 mx-auto lg:mx-0 mb-6 object-contain drop-shadow-lg"
          />
          <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-4">
            The feedback tool that helps you retain communities and grow your reputation.
          </h1>
          <p className="text-white/80 text-lg mb-8">
            ResidentPulse gives HOA management companies direct insight into
            board member satisfaction — so you can improve service, prevent
            surprises at renewal time, and prove your value with data.
          </p>

          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">Survey Board Members Directly</p>
                <p className="text-white/60 text-sm">Automated NPS rounds on your schedule — we invite, remind, and collect responses so your team doesn't have to.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">AI That Reads Between the Lines</p>
                <p className="text-white/60 text-sm">Our AI analyzes open-ended feedback and surfaces what boards actually care about — so you can act before issues escalate.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">Retain More Communities</p>
                <p className="text-white/60 text-sm">Spot dissatisfaction early, demonstrate responsiveness, and turn renewals into a formality.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "var(--cam-green)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">Build Your Reputation With Data</p>
                <p className="text-white/60 text-sm">Share NPS scores with prospective clients to stand out from competitors who are just guessing.</p>
              </div>
            </div>
          </div>

          <Link
            to="/admin/signup"
            className="inline-block px-8 py-3 rounded-lg text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
            style={{ backgroundColor: "var(--cam-green)" }}
          >
            Start Your Free Trial
          </Link>
          <p className="text-white/50 text-xs mt-3">No credit card required. Free for up to 25 board members.</p>
        </div>

        {/* Right: Login Card */}
        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500 mb-6">Sign in to your admin dashboard</p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
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

              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
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
