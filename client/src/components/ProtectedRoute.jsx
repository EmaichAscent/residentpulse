import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    // Redirect to appropriate login page based on required role
    if (requiredRole === "superadmin") {
      return <Navigate to="/superadmin/login" replace />;
    }
    return <Navigate to="/admin/login" replace />;
  }

  // Check if user has the required role
  if (requiredRole && user.role !== requiredRole) {
    // User is authenticated but doesn't have the required role
    if (user.role === "superadmin") {
      return <Navigate to="/superadmin" replace />;
    }
    return <Navigate to="/admin" replace />;
  }

  return children;
}
