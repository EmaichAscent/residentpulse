import { useState, useRef, useEffect, useCallback } from "react";
import ChatBubble from "./ChatBubble";

export default function InterviewChat({ interviewId, onComplete, onEndEarly, initialMessages = [] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const sendMessage = async (text) => {
    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/interview/${interviewId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const aiMsg = { role: "assistant", content: data.message, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMsg]);

      // Check if AI is asking for confirmation (summary)
      const lower = data.message.toLowerCase();
      if (lower.includes("does this sound right") || lower.includes("does that sound right") || lower.includes("sound accurate")) {
        if (onComplete) onComplete(data.message);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.map((msg, i) => (
          <ChatBubble key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
        ))}

        {loading && (
          <div className="flex justify-start mb-4">
            <img
              src="/camascent-chat-icon.png"
              alt="CAM Ascent"
              className="w-8 h-8 rounded-full object-contain bg-white border border-gray-200 mr-2 mt-1 flex-shrink-0"
            />
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t flex-shrink-0">
        <form onSubmit={handleSubmit} className="px-4 py-3 flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={loading}
            rows={2}
            className="input-field flex-1 disabled:bg-gray-50 resize-none"
            style={{ maxHeight: 150 }}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-send"
          >
            Send
          </button>
        </form>
        {onEndEarly && (
          <div className="px-4 pb-3">
            <button
              onClick={onEndEarly}
              disabled={loading}
              className="w-full py-2 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              End Interview Early
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
