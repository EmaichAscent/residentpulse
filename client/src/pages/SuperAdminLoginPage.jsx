import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function SuperAdminLoginPage() {
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
      const response = await fetch("/api/auth/superadmin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Login failed");
      }

      // Redirect to superadmin dashboard
      navigate("/superadmin");
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

      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-8">
        {/* Branding */}
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

        {/* Login Card */}
        <div className="w-full max-w-md">
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">SuperAdmin Portal</h2>
            <p className="text-base text-gray-500 mb-6">Sign in to manage all clients and settings</p>

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
                  to="/superadmin/forgot-password"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cam-blue)" }}
                >
                  Forgot your password?
                </Link>
              </div>
            </form>
          </div>

          <p className="text-center text-sm text-white/50 mt-6">
            SuperAdmin access only
          </p>
        </div>
      </div>
    </div>
  );
}
