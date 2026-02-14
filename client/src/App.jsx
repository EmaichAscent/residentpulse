import { Routes, Route } from "react-router-dom";
import IdentifyPage from "./pages/IdentifyPage";
import ChatPage from "./pages/ChatPage";
import AdminPage from "./pages/AdminPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import SuperAdminLoginPage from "./pages/SuperAdminLoginPage";
import ClientAdminLoginPage from "./pages/ClientAdminLoginPage";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<IdentifyPage />} />
        <Route path="/chat" element={<ChatPage />} />

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

        {/* Client Admin routes */}
        <Route path="/admin/login" element={<ClientAdminLoginPage />} />
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
