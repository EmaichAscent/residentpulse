import { Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";
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
import RoundsLanding from "./components/RoundsLanding";
import RoundDashboard from "./components/RoundDashboard";
import TrendsView from "./components/TrendsView";
import CommunityManager from "./components/CommunityManager";
import UserManager from "./components/UserManager";
import AccountSettings from "./components/AccountSettings";

export default function App() {
  return (
    <ErrorBoundary>
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
        >
          <Route index element={<Navigate to="rounds" replace />} />
          <Route path="rounds" element={<RoundsLanding />} />
          <Route path="rounds/:roundId" element={<RoundDashboard />} />
          <Route path="trends" element={<TrendsView />} />
          <Route path="communities" element={<CommunityManager />} />
          <Route path="members" element={<UserManager />} />
          <Route path="account" element={<AccountSettings />} />
        </Route>
        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
    </ErrorBoundary>
  );
}
