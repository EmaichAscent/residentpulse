import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-bold text-gray-200 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h2>
        <p className="text-gray-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/admin/login"
          className="inline-block px-6 py-3 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
          style={{ backgroundColor: "var(--cam-blue)" }}
        >
          Go to Login
        </Link>
      </div>
    </div>
  );
}
