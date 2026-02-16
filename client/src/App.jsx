import { Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import TokenSurveyPage from "./pages/TokenSurveyPage";
import AdminPage from "./pages/AdminPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import SuperAdminLoginPage from "./pages/SuperAdminLoginPage";
import ClientAdminLoginPage from "./pages/ClientAdminLoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SignUpPage from "./pages/SignUpPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import AdminOnboardingPage from "./pages/AdminOnboardingPage";
import SuperAdminClientDetailPage from "./pages/SuperAdminClientDetailPage";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/survey" element={<TokenSurveyPage />} />

        {/* SuperAdmin routes */}
        <Route path="/superadmin/login" element={<SuperAdminLoginPage />} />
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute requiredRole="superadmin">
              <SuperAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/clients/:id"
          element={
            <ProtectedRoute requiredRole="superadmin">
              <SuperAdminClientDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Client Admin routes */}
        <Route path="/admin/login" element={<ClientAdminLoginPage />} />
        <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/signup" element={<SignUpPage />} />
        <Route path="/admin/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/admin/onboarding"
          element={
            <ProtectedRoute requiredRole="client_admin">
              <AdminOnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="client_admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}
