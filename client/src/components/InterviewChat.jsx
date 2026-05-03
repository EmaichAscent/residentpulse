import { useState, useRef, useEffect, useCallback } from "react";

/**
 * InterviewChat — admin onboarding interview panel, redesigned to
 * match the v2 resident ChatPage aesthetic (sharp-corner bubbles,
 * pulse-green avatar, white card with var(--line) border).
 *
 * Renders an inline ChatMessage rather than the shared ChatBubble so
 * the admin Test Interview UI (which still uses ChatBubble) stays
 * untouched. The bubble shape mirrors the resident chat exactly:
 *   • Assistant:  4/14 corners, white bg, --ink text, --shadow-sm
 *   • User:       14/4 corners, --ink bg, white text
 *   • Avatar:     32px pulse gradient with the EKG path glyph
 *
 * Wire-up unchanged from the previous version:
 *   - POST /api/admin/interview/:id/message for each turn
 *   - onComplete(aiMessage) fires when the AI emits one of the
 *     "does this sound right" wrap phrases (V2.1 prompt close)
 *   - onEndEarly fires when the user clicks "Finish & Review"
 *
 * Layout strategy: matches the resident chat — flex column with a
 * scrollable messages area in the middle and a fixed input bar +
 * footer at the bottom. The parent page provides the height.
 */
export default function InterviewChat({
  interviewId,
  onComplete,
  onEndEarly,
  initialMessages = [],
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, loading]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
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

      const aiMsg = {
        role: "assistant",
        content: data.message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // V2.1 onboarding close: the AI emits one of these phrases when
      // it has gathered enough signal to summarize. Auto-advance to the
      // Review step so the operator confirms before /confirm runs.
      const lower = data.message.toLowerCase();
      if (
        lower.includes("does this sound right") ||
        lower.includes("does that sound right") ||
        lower.includes("sound accurate")
      ) {
        if (onComplete) onComplete(data.message);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        },
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
    <div
      className="flex flex-col w-full bg-white overflow-hidden rounded-2xl"
      style={{
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-sm)",
        height: "calc(100dvh - 220px)",
        minHeight: 420,
      }}
      data-testid="interview-chat"
    >
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: "20px 16px", background: "var(--paper)" }}
      >
        <div className="flex flex-col" style={{ gap: 14 }}>
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
          ))}
          {loading && <TypingDots />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="bg-white flex-shrink-0"
        style={{ borderTop: "1px solid var(--line)", padding: "10px 12px" }}
      >
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response…"
            disabled={loading}
            rows={1}
            className="w-full text-[14px] resize-none outline-none transition disabled:opacity-50"
            style={{
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "10px 48px 10px 14px",
              backgroundColor: "var(--paper)",
              color: "var(--ink)",
              lineHeight: 1.4,
              minHeight: 40,
              maxHeight: 120,
            }}
            autoFocus
          />
          <div className="absolute" style={{ right: 6, bottom: 6 }}>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md flex items-center justify-center transition"
              style={{
                width: 30,
                height: 30,
                backgroundColor: input.trim() ? "var(--ink)" : "var(--paper-3)",
                color: input.trim() ? "white" : "var(--ink-4)",
                cursor: input.trim() && !loading ? "pointer" : "default",
              }}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </form>

      {/* Wrap-up footer */}
      {onEndEarly && (
        <div
          className="bg-white flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--line)", padding: "10px 16px" }}
        >
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            Ready to wrap up?
          </span>
          <button
            type="button"
            onClick={onEndEarly}
            disabled={loading}
            className="font-semibold rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: "var(--pulse)",
              boxShadow: "var(--shadow-sm)",
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            Finish &amp; Review →
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ChatMessage — mirrors the resident ChatPage's inline bubble shape.
// ──────────────────────────────────────────────────────────────────────

function ChatMessage({ role, content, timestamp }) {
  const isUser = role === "user";
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex flex-col items-end" style={{ maxWidth: "min(86%, 360px)" }}>
          <div
            className="text-[14.5px] leading-[1.5] whitespace-pre-wrap break-words"
            style={{
              backgroundColor: "var(--ink)",
              color: "white",
              padding: "10px 14px",
              borderRadius: "14px 14px 4px 14px",
            }}
          >
            {content}
          </div>
          {time && (
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-4)" }}>
              {time}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <PulseAvatar />
      <div className="flex flex-col" style={{ maxWidth: "min(86%, 420px)" }}>
        <div
          className="text-[14.5px] leading-[1.5] whitespace-pre-wrap break-words"
          style={{
            backgroundColor: "white",
            color: "var(--ink)",
            padding: "12px 14px",
            borderRadius: "4px 14px 14px 14px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {content}
        </div>
        {time && (
          <p className="text-[11px] mt-1 ml-1" style={{ color: "var(--ink-4)" }}>
            {time}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-start gap-2.5">
      <PulseAvatar />
      <div
        className="flex items-center gap-1.5 rounded-[4px_14px_14px_14px]"
        style={{
          backgroundColor: "white",
          padding: "14px 16px",
          boxShadow: "var(--shadow-sm)",
        }}
        aria-label="AI is typing"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "var(--ink-4)",
              animation: `rp-bounce 1.2s infinite ${i * 0.15}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes rp-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function PulseAvatar() {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: 32,
        height: 32,
        background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
        boxShadow: "0 2px 8px rgba(31,165,113,0.25)",
      }}
      aria-hidden="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h4l2-7 4 14 2-7h6" />
      </svg>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
