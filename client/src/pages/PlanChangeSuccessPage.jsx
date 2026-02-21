import { Link } from "react-router-dom";

export default function PlanChangeSuccessPage() {
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Plan Updated!</h2>
              <p className="text-gray-600 mb-6">
                Your subscription has been updated successfully. Your new plan is now active.
              </p>
              <Link
                to="/admin/dashboard"
                className="block w-full text-center py-2.5 rounded-lg text-white font-semibold transition"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                Go to Dashboard
              </Link>
              <Link
                to="/admin/account"
                className="block text-center text-sm mt-3 hover:underline"
                style={{ color: "var(--cam-blue)" }}
              >
                View Account Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
