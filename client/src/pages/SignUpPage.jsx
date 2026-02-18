import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function SignUpPage() {
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  // Company fields
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Admin fields
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/signup/plans")
      .then((res) => res.json())
      .then((data) => {
        setPlans(data);
        // Auto-select free plan
        const free = data.find((p) => p.name === "free");
        if (free) setSelectedPlanId(free.id);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedPlanId) {
      setError("Please select a plan.");
      return;
    }

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
      const res = await fetch("/api/signup/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          state,
          zip,
          phone_number: phoneNumber,
          admin_email: adminEmail,
          password,
          plan_id: selectedPlanId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-community.jpg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/85 via-gray-900/75 to-gray-800/80" />
        </div>
        <div className="relative flex flex-col items-center justify-center min-h-screen px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">ResidentPulse</h1>
            <a href="https://camascent.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 text-white/70 hover:text-white/90 transition-colors">
              <span className="text-base font-medium">Powered by</span>
              <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
              <span className="text-base font-semibold">CAM Ascent Analytical Insights</span>
            </a>
          </div>
          <div className="bg-white shadow-2xl rounded-2xl p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Check Your Email</h2>
              <p className="text-gray-600 mb-2">
                We've sent a verification link to:
              </p>
              <p className="font-semibold text-gray-900 mb-4">{adminEmail}</p>
              <p className="text-sm text-gray-500 mb-6">
                Click the link in the email to activate your account. The link expires in 24 hours.
              </p>
              <Link
                to="/admin/login"
                className="block text-center text-sm hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Hero background image with overlay — matches login page */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/hero-community.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900/85 via-gray-900/75 to-gray-800/80" />
      </div>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="max-w-2xl w-full">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">ResidentPulse</h1>
          <a href="https://camascent.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 mb-4 text-white/70 hover:text-white/90 transition-colors">
            <span className="text-base font-medium">Powered by</span>
            <img src="/CAMAscent.png" alt="CAM Ascent" className="h-8 object-contain" />
            <span className="text-base font-semibold">CAM Ascent Analytical Insights</span>
          </a>
          <p className="text-white/70 text-sm">Create Your Account</p>
        </div>

        {/* Form Card */}
        <div className="bg-white shadow-2xl rounded-2xl p-8">
          <form onSubmit={handleSubmit}>
            {/* Section 1: Choose Plan */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Choose Your Plan</h2>
              <div className="grid grid-cols-2 gap-3">
                {plans.map((plan) => {
                  const isFree = plan.price_cents === null && plan.name === "free";
                  const isSelected = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`relative p-4 rounded-xl border-2 text-left transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <p className="font-bold text-gray-900">{plan.display_name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Up to {plan.member_limit.toLocaleString()} board members
                      </p>
                      <p className="text-sm text-gray-600">
                        {plan.survey_rounds_per_year} survey rounds/year
                      </p>
                      <p className="text-xs font-semibold mt-2" style={{ color: isFree ? "var(--cam-green)" : "var(--cam-blue)" }}>
                        {isFree ? "Free Forever" : "Contact Us for Pricing"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Company Information */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Company Information</h2>

              <div className="mb-4">
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Management Company Name
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="addressLine1" className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 1
                </label>
                <input
                  id="addressLine1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="addressLine2" className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 2 <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  id="addressLine2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="input-field"
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code
                  </label>
                  <input
                    id="zip"
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="input-field"
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            </div>

            {/* Section 3: Admin Account */}
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Admin Account</h2>

              <div className="mb-4">
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@yourcompany.com"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
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
                  minLength={8}
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
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
              {loading ? "Creating Account..." : "Create Account"}
            </button>

            <div className="text-center mt-4">
              <Link
                to="/admin/login"
                className="text-sm hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                Already have an account? Log in
              </Link>
            </div>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}
