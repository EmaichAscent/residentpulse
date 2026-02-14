export default function ChatBubble({ role, content, timestamp }) {
  const isUser = role === "user";

  const formatTime = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <img
          src="/camascent-chat-icon.png"
          alt="CAM Ascent"
          className="w-8 h-8 rounded-full object-contain bg-white border border-gray-200 mr-2 mt-1 flex-shrink-0"
        />
      )}
      <div>
        <div className={isUser ? "bubble-user" : "bubble-assistant"}>
          {content}
        </div>
        {timestamp && (
          <p className={`text-xs text-gray-400 mt-1 ${isUser ? "text-right" : "text-left"}`}>
            {formatTime(timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}
