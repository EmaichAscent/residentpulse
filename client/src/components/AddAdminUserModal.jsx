import { useState } from "react";

export default function AddAdminUserModal({ isOpen, onClose, onAdd }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include"
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add admin user");
      }

      const data = await response.json();
      setSuccess(data);
      onAdd();

      // Reset form after 5 seconds
      setTimeout(() => {
        setEmail("");
        setSuccess(null);
        onClose();
      }, 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Admin User</h2>

        {success ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800 font-medium mb-2">Admin user created successfully!</p>
              <p className="text-sm text-green-700">Share these credentials with the new admin:</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-md space-y-2">
              <div>
                <p className="text-xs text-gray-500">Email:</p>
                <p className="text-sm font-mono font-medium text-gray-900">{success.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Temporary Password:</p>
                <p className="text-sm font-mono font-medium text-gray-900">{success.temp_password}</p>
              </div>
            </div>

            <p className="text-xs text-gray-500">This dialog will close automatically in 5 seconds...</p>

            <button
              onClick={() => {
                setSuccess(null);
                setEmail("");
                onClose();
              }}
              className="w-full btn-primary"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="newadmin@example.com"
                required
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                A temporary password will be generated and displayed after creation.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? "Adding..." : "Add Admin User"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
