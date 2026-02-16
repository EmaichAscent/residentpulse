export default function ChatBubble({ role, content, timestamp, compact = false }) {
  const isUser = role === "user";

  const formatTime = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const bubbleClass = isUser
    ? (compact ? "bubble-user-sm" : "bubble-user")
    : (compact ? "bubble-assistant-sm" : "bubble-assistant");

  const iconSize = compact ? "w-6 h-6" : "w-8 h-8";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${compact ? "mb-3" : "mb-4"}`}>
      {!isUser && (
        <img
          src="/camascent-chat-icon.png"
          alt="CAM Ascent"
          className={`${iconSize} rounded-full object-contain bg-white border border-gray-200 mr-2 mt-1 flex-shrink-0`}
        />
      )}
      <div>
        <div className={bubbleClass}>
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
