import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatBubble from "../components/ChatBubble";
import NpsScale from "../components/NpsScale";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId, email, firstName, community, company } = location.state || {};

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [npsSubmitted, setNpsSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }

    // Load session data and previous messages (for resumed sessions)
    const loadSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        if (!res.ok) return;

        // Set messages if any exist
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          })));
        }

        // Set state based on session data
        if (data.session.nps_score !== null) {
          setNpsSubmitted(true);
        }
        if (data.session.completed) {
          setCompleted(true);
        }
      } catch (err) {
        console.error("Failed to load session:", err);
      }
    };

    loadSession();
  }, [sessionId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message, timestamp: data.timestamp || new Date().toISOString() },
      ]);
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

  const handleNpsSelect = async (score) => {
    setNpsSubmitted(true);

    // Save NPS score to session
    await fetch(`/api/sessions/${sessionId}/nps`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nps_score: score }),
    });

    // Send NPS as first message to start conversation
    sendMessage(`My NPS score is ${score} out of 10.`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading || completed) return;
    sendMessage(input.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
      // Refocus immediately to prevent blur
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleEndChat = async () => {
    setCompleted(true);
    // Stop mic if listening
    if (listening) recognitionRef.current?.stop();

    await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "PATCH",
    });
  };

  // Speech recognition
  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    finalTranscript = input; // preserve any existing text
    recognition.start();
    setListening(true);
  };

  if (!sessionId) return null;

  // Build personalized welcome message
  const userName = firstName || "there";
  const companyText = company ? ` on behalf of ${company}` : "";
  const roleText = community ? ` as a board member at ${community}` : " as a board member";

  const welcomeContent = SpeechRecognition
    ? `Hi ${userName}! We're collecting feedback${companyText} about how well they serve you${roleText}. You can type your responses or click the microphone button to speak (your browser will ask for permission the first time). When you're finished, click "End Chat" at any time. Let's start with a quick rating.`
    : `Hi ${userName}! We're collecting feedback${companyText} about how well they serve you${roleText}. When you're finished, click "End Chat" at any time. Let's start with a quick rating.`;

  return (
    <div className="flex flex-col h-screen bg-brand-gradient">
      <div className="flex flex-col h-full max-w-2xl mx-auto w-full shadow-xl">
        {/* Header */}
        <div className="bg-white border-b px-5 py-4 flex-shrink-0 flex items-center">
          <div className="w-1/2">
            <h1 className="text-xl font-bold text-gray-900">ResidentPulse</h1>
            <img src="/CAMAscent.png" alt="CAM Ascent" className="h-10 object-contain mt-1" />
          </div>
          <div className="w-1/2 text-right">
            <p className="font-semibold text-gray-900">{email}</p>
            {company && <p className="text-sm text-gray-500">{company}</p>}
            {community && <p className="text-sm text-gray-500">{community}</p>}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-6 bg-gradient-to-b from-gray-50 to-white">
        {/* Initial greeting + NPS */}
        {!npsSubmitted && (
          <>
            <ChatBubble role="assistant" content={welcomeContent} />
            <div className="ml-10">
              <NpsScale onSelect={handleNpsSelect} />
            </div>
          </>
        )}

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

        {completed && (
          <div className="text-center py-6">
            <p className="text-lg text-gray-500">Session complete. Thank you for your feedback!</p>
          </div>
        )}

        <div ref={bottomRef} />
        </div>

        {/* Bottom bar: input + end chat */}
        {npsSubmitted && !completed && (
          <div className="bg-white border-t flex-shrink-0">
          <form onSubmit={handleSubmit} className="px-5 py-4 flex gap-3 items-end">
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
            {SpeechRecognition && (
              <button
                type="button"
                onClick={toggleListening}
                className={`p-4 rounded-xl transition ${
                  listening
                    ? "bg-red-100 text-red-600 hover:bg-red-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                title={listening ? "Stop recording" : "Start voice input"}
              >
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
                    <path d="M6 11a1 1 0 10-2 0 8 8 0 0016 0 1 1 0 10-2 0 6 6 0 01-12 0z" />
                    <path d="M11 19.93A8.01 8.01 0 014 12a1 1 0 112 0 6 6 0 0012 0 1 1 0 112 0 8.01 8.01 0 01-7 7.93V22a1 1 0 11-2 0v-2.07z" />
                  </svg>
                  {listening && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-send"
            >
              Send
            </button>
          </form>
          <div className="px-5 pb-4">
            <button
              onClick={handleEndChat}
              disabled={loading}
              className="w-full py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
            >
              End Chat
            </button>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
