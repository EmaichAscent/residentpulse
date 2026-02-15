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
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: "linear-gradient(135deg, #3B9FE7 0%, #1AB06E 100%)" }}>
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/camascent-icon.png"
            alt="CAM Ascent"
            className="h-32 mx-auto mb-6 object-contain drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold text-white tracking-wide">ResidentPulse</h1>
          <p className="text-white/70 mt-1 text-sm">Client Admin Portal</p>
        </div>

        {/* Login Card */}
        <div className="bg-white shadow-2xl rounded-2xl p-8">
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
          </form>
        </div>

        <p className="text-center text-sm text-white/60 mt-6">
          Need help? Contact your administrator
        </p>
      </div>
    </div>
  );
}
