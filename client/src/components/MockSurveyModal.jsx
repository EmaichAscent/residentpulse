import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function MockSurveyModal({ clientId, onClose }) {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [useGeneric, setUseGeneric] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [genericName, setGenericName] = useState("Test User");
  const [genericEmail, setGenericEmail] = useState("mock-test@residentpulse.local");
  const [genericCommunity, setGenericCommunity] = useState("Test Community");

  useEffect(() => {
    fetch(`/api/superadmin/clients/${clientId}/members`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setMembers(data);
        if (data.length > 0) setSelectedMemberId(String(data[0].id));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const body = useGeneric
        ? { first_name: genericName, email: genericEmail, community_name: genericCommunity }
        : { user_id: Number(selectedMemberId) };

      const res = await fetch(`/api/superadmin/clients/${clientId}/mock-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create mock session");
        setStarting(false);
        return;
      }

      const data = await res.json();
      navigate("/chat", {
        state: {
          sessionId: data.session_id,
          email: data.email,
          firstName: data.first_name,
          community: data.community,
          company: data.company,
          clientId: data.client_id,
          hasLogo: data.has_logo,
          companyName: data.company_name,
          isMock: true,
        },
      });
    } catch {
      alert("Failed to create mock session");
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Test Survey</h2>
        <p className="text-sm text-gray-500 mb-4">
          Experience the survey as a board member would. This session won't affect analytics.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading members...</p>
        ) : (
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useGeneric}
                  onChange={(e) => setUseGeneric(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
              <span className="text-sm text-gray-700">Use generic test identity</span>
            </div>

            {useGeneric ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={genericEmail}
                    onChange={(e) => setGenericEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Community</label>
                  <input
                    type="text"
                    value={genericCommunity}
                    onChange={(e) => setGenericCommunity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Board Member</label>
                {members.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No active members found. Use generic identity instead.</p>
                ) : (
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} — {m.email} ({m.community_name || "No community"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            disabled={starting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={starting || loading || (!useGeneric && !selectedMemberId)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 bg-purple-600 hover:bg-purple-700"
          >
            {starting ? "Starting..." : "Start Mock Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
