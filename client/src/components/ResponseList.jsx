import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

export default function ResponseList({ sessions, onDelete }) {
  const [expanded, setExpanded] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const toggleExpand = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/responses/${id}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleDeleteClick = (e, id, email) => {
    e.stopPropagation();
    setDeleteTarget({ id, email });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/admin/responses/${deleteTarget.id}`, { method: "DELETE" });
      if (expanded === deleteTarget.id) setExpanded(null);
      onDelete?.(deleteTarget.id);
    } catch {
      // silently fail
    } finally {
      setDeleteTarget(null);
    }
  };

  const npsColor = (score) => {
    if (score === null || score === undefined) return "text-gray-400";
    if (score <= 6) return "text-red-600";
    if (score <= 8) return "text-yellow-600";
    return "text-green-600";
  };

  if (!sessions.length) {
    return <p className="text-gray-500 text-center py-10 text-lg">No responses yet.</p>;
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleExpand(s.id)}
            className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{s.email}</p>
              <div className="flex flex-wrap gap-x-3 text-sm text-gray-500">
                {s.community_name && <span>{s.community_name}</span>}
                {s.management_company && <span>{s.management_company}</span>}
              </div>
              <p className="text-sm text-gray-400">
                {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} &middot; {s.message_count} messages
                {s.completed ? "" : " (in progress)"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className={`text-2xl font-bold ${npsColor(s.nps_score)}`}>
                  {s.nps_score !== null && s.nps_score !== undefined ? s.nps_score : "—"}
                </span>
                <p className="text-xs text-gray-400">NPS</p>
              </div>
              <button
                onClick={(e) => handleDeleteClick(e, s.id, s.email)}
                className="p-2 text-gray-300 hover:text-red-500 transition"
                title="Delete session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </button>

          {expanded === s.id && (
            <div className="border-t px-5 py-4 bg-gray-50">
              {s.summary && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-semibold text-blue-600 uppercase mb-1">AI Summary</p>
                  <p className="text-gray-800">{s.summary}</p>
                </div>
              )}
              {loadingMessages ? (
                <p className="text-gray-400">Loading transcript...</p>
              ) : messages.length === 0 ? (
                <p className="text-gray-400">No messages in this session.</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase">{m.role}</p>
                        <p className="text-xs text-gray-300">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <p className="text-gray-800">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Session"
        message={deleteTarget ? `Delete session for ${deleteTarget.email}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
