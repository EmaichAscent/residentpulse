import { useState } from "react";

export default function InvitationModal({ selectedUsers, userList, onClose, onSent }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Get full user objects for selected IDs
  const selectedUserObjects = userList.filter(u => selectedUsers.has(u.id));

  const handleSend = async () => {
    setSending(true);
    setResult(null);

    try {
      const userIds = Array.from(selectedUsers);

      const response = await fetch("/api/admin/board-members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_ids: userIds })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitations");
      }

      setResult(data);
      setSending(false);

      if (data.sent > 0) {
        onSent(); // Refresh user list to show last_invited_at
      }
    } catch (err) {
      console.error("Failed to send invitations:", err);
      setResult({
        sent: 0,
        failed: selectedUsers.size,
        error: err.message
      });
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Send Survey Invitations</h2>

        {!result ? (
          <>
            {/* Preview list of users */}
            <p className="text-gray-600 mb-4">
              You're about to send survey invitations to {selectedUserObjects.length} board member{selectedUserObjects.length !== 1 ? "s" : ""}:
            </p>

            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg mb-6">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Community</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedUserObjects.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        {user.first_name && user.last_name
                          ? `${user.first_name} ${user.last_name}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-sm">{user.email}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {user.community_name || <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                disabled={sending}
                className="px-5 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-5 py-3 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </span>
                ) : (
                  `Send ${selectedUserObjects.length} Invitation${selectedUserObjects.length !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Results summary */}
            <div className="mb-6">
              {result.error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800 font-medium">❌ Error: {result.error}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-600 font-medium">✅ Sent</p>
                      <p className="text-2xl font-bold text-green-800">{result.sent}</p>
                    </div>
                    {result.failed > 0 && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600 font-medium">❌ Failed</p>
                        <p className="text-2xl font-bold text-red-800">{result.failed}</p>
                      </div>
                    )}
                  </div>

                  {/* Detailed results */}
                  {result.results && result.results.length > 0 && (
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Email</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {result.results.map((r, idx) => (
                            <tr key={idx} className={r.status === "sent" ? "bg-green-50" : "bg-red-50"}>
                              <td className="px-4 py-2 text-sm">{r.email || `User #${r.user_id}`}</td>
                              <td className="px-4 py-2 text-sm">
                                {r.status === "sent" ? (
                                  <span className="text-green-600 font-medium">✅ Sent</span>
                                ) : (
                                  <span className="text-red-600 font-medium">❌ Failed</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600">
                                {r.error || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Close button */}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-3 text-sm font-semibold text-white rounded-lg"
                style={{ backgroundColor: "var(--cam-blue)" }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
