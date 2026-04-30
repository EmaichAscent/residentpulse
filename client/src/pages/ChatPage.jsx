import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NpsScale from "../components/NpsScale";
import { buildWelcomeMessage } from "../utils/chatWelcome";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

/**
 * Resident chat — Polished variant per design handoff §5.8.
 *
 * Phase 3 PR8 rebuild. Material differences from the previous shape:
 *
 *  Trust gate
 *    A short "Sounds good →" engagement step before the NPS picker.
 *    The first AI bubble names a real CM (or "your team at {company}"),
 *    sets honest timing ("about 5 minutes"), and states the privacy
 *    contract: management company sees only a summary, not the
 *    transcript. The user explicitly opts in.
 *
 *  Two AI bubbles in sequence
 *    Trust contract bubble + a separate, plain "On a scale of 0 to 10..."
 *    bubble that introduces the NPS picker. The picker itself is the
 *    minimalist outlined-circle scale (NpsScale.jsx) with auto-advance
 *    and no Submit Score button.
 *
 *  Header
 *    Small logo/avatar, two-line title (company / "{community} · check-in
 *    for {firstName}"), and a "✓ Confidential" pill on the right that
 *    underlines the privacy contract.
 *
 *  Progress bar
 *    Thin pulse-green stripe at the top that grows with conversation
 *    turns. 0% during trust gate, 10% on NPS-shown, 25% post-NPS, +6% per
 *    AI/user turn capped at 95%, 100% on completion.
 *
 *  Resume behavior
 *    A session that already has an NPS score skips the trust gate (the
 *    resident has already past that point); messages render normally.
 */
export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    sessionId,
    firstName,
    community,
    company,
    clientId,
    hasLogo,
    companyName,
    isMock,
    googleReviewUrl,
  } = location.state || {};

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [trustAccepted, setTrustAccepted] = useState(false);
  const [npsSubmitted, setNpsSubmitted] = useState(false);
  const [npsScore, setNpsScore] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(!!synth);
  const [speaking, setSpeaking] = useState(false);
  const [reviewResponse, setReviewResponse] = useState(null);
  const [communityManagerName, setCommunityManagerName] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastSpokenIndexRef = useRef(-1);

  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }

    const loadSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        if (!res.ok) return;

        if (data.session?.community_manager_name) {
          setCommunityManagerName(data.session.community_manager_name);
        }

        if (data.messages && data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.created_at,
            }))
          );
        }

        // Resume behavior: if NPS is already submitted, jump straight to
        // the conversation view (skip trust gate + NPS).
        if (data.session?.nps_score !== null && data.session?.nps_score !== undefined) {
          setTrustAccepted(true);
          setNpsSubmitted(true);
          setNpsScore(data.session.nps_score);
        }
        if (data.session?.completed) {
          setTrustAccepted(true);
          setNpsSubmitted(true);
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
  }, [messages, loading, trustAccepted, npsSubmitted]);

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

  const stopSpeaking = useCallback(() => {
    if (synth) synth.cancel();
    setSpeaking(false);
  }, []);

  const speakText = useCallback(
    (text) => {
      if (!synth || !speechEnabled) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      const voices = synth.getVoices();
      const preferred =
        voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ||
        voices.find((v) => v.name.includes("Samantha")) ||
        voices.find((v) => v.lang.startsWith("en") && v.localService);
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [speechEnabled]
  );

  // Auto-speak new AI messages (post-NPS only, so pre-NPS bubbles don't read aloud)
  useEffect(() => {
    if (!speechEnabled || messages.length === 0) return;
    const lastIndex = messages.length - 1;
    const lastMsg = messages[lastIndex];
    if (lastMsg.role === "assistant" && lastIndex > lastSpokenIndexRef.current) {
      lastSpokenIndexRef.current = lastIndex;
      speakText(lastMsg.content);
    }
  }, [messages, speechEnabled, speakText]);

  const sendMessage = async (text) => {
    stopSpeaking();
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
        {
          role: "assistant",
          content: data.message,
          timestamp: data.timestamp || new Date().toISOString(),
        },
      ]);
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

  const handleAcceptTrust = () => {
    setTrustAccepted(true);
  };

  const handleNpsSelect = async (score) => {
    setNpsSubmitted(true);
    setNpsScore(score);

    await fetch(`/api/sessions/${sessionId}/nps`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nps_score: score }),
    });

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
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleEndChat = async () => {
    setCompleted(true);
    stopSpeaking();
    if (listening) recognitionRef.current?.stop();

    await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "PATCH",
    });

    if (googleReviewUrl) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setReviewResponse(data.session.google_review_response || null);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    stopSpeaking();

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

    finalTranscript = input;
    recognition.start();
    setListening(true);
  };

  if (!sessionId) return null;

  // Welcome message — built fresh from props + fetched CM name. Pure
  // helper, fully unit-tested in chatWelcome.test.js.
  const welcomeContent = buildWelcomeMessage({
    firstName,
    company,
    community,
    communityManagerName,
  });

  // Hardcoded NPS prompt (rendered as a second AI bubble after the
  // user clicks Sounds good →). Naming the company keeps the framing
  // concrete; it's what the V2 system prompt would say if it generated
  // this turn — but rendering it client-side gives us deterministic
  // copy for the entry experience.
  const npsPrompt = `On a scale of 0 to 10, how likely are you to recommend ${
    company || "your management company"
  } to another HOA board?`;

  // Progress bar percent.
  // 0%   → trust-gate shown but not accepted
  // 10%  → trust accepted, NPS shown but not picked
  // 25%  → NPS picked, conversation begins
  // +6%  per assistant message after NPS, capped at 95%
  // 100% → session complete
  const progressPercent = (() => {
    if (completed) return 100;
    if (!trustAccepted) return 0;
    if (!npsSubmitted) return 10;
    const aiTurns = messages.filter((m) => m.role === "assistant").length;
    return Math.min(95, 25 + aiTurns * 6);
  })();

  // Header subtitle: "{community} · check-in for {firstName}"
  const headerSubtitle = (() => {
    const parts = [];
    if (community) parts.push(community);
    parts.push(`check-in for ${firstName || "you"}`);
    return parts.join(" · ");
  })();

  return (
    <div
      className="flex flex-col min-h-screen items-center px-4 py-6"
      style={{
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
      }}
    >
      <div
        className="flex flex-col w-full max-w-3xl rounded-2xl overflow-hidden bg-white my-auto"
        style={{
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--line)",
          maxHeight: "min(720px, 100vh - 80px)",
          // Pre-conversation (trust gate / NPS picker): card sizes to
          // content so the welcome bubble + CTA don't sit above a sea
          // of dead space.
          //
          // Conversation: a min-height so the card has presence when
          // the conversation is short (otherwise a 2-message exchange
          // floats in the middle of a tall card), plus the maxHeight
          // above so it doesn't grow past the viewport. Messages
          // container fills the gap with flex-1 + scrolls as needed.
          ...(npsSubmitted ? { minHeight: "min(520px, 100vh - 80px)" } : { minHeight: 0 }),
        }}
        data-testid="chat-card"
      >
        {/* Progress bar (1.5px high stripe) */}
        <div
          className="h-[2px] flex-shrink-0 relative overflow-hidden"
          style={{ backgroundColor: "var(--paper-3)" }}
          aria-hidden="true"
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: "var(--pulse)",
            }}
            data-testid="progress-bar"
          />
        </div>

        {/* Header — Polished variant: avatar + 2-line title + Confidential pill */}
        <div
          className="bg-white px-5 py-4 flex-shrink-0 flex items-center justify-between gap-3"
          style={{ borderBottom: "1px solid var(--line)" }}
          data-testid="chat-header"
        >
          <div className="flex items-center gap-3 min-w-0">
            <BrandAvatar hasLogo={hasLogo} clientId={clientId} companyName={companyName} />
            <div className="min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--ink)" }}
                title={company || ""}
              >
                {company || "ResidentPulse"}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: "var(--ink-3)" }}
                title={headerSubtitle}
              >
                {headerSubtitle}
              </p>
            </div>
          </div>
          <div
            className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ color: "var(--pulse-deep)", backgroundColor: "var(--pulse-tint)" }}
            title="Your responses are private. The management company sees a summary, not the transcript."
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Confidential
          </div>
        </div>

        {/* Mock survey banner */}
        {isMock && (
          <div
            className="px-5 py-2 flex-shrink-0"
            style={{
              backgroundColor: "var(--plum-tint)",
              borderBottom: "1px solid var(--plum-soft)",
            }}
          >
            <p className="text-xs font-medium text-center" style={{ color: "var(--plum)" }}>
              Mock Survey Mode &mdash; This session will not affect analytics
            </p>
          </div>
        )}

        {/* Messages — flex-1 only after NPS so the area expands to fill
            the locked card height; pre-NPS it stays at content size. */}
        <div
          className={`${npsSubmitted ? "flex-1 overflow-y-auto" : ""} px-5 py-5`}
          style={{
            background: "linear-gradient(180deg, var(--paper-2) 0%, var(--paper) 100%)",
          }}
        >
          {/* Phase 1: Trust gate — welcome bubble + Sounds good button */}
          {!trustAccepted && (
            <>
              <ChatMessage role="assistant" content={welcomeContent} />
              <div className="ml-10 mt-2 mb-2" data-testid="trust-gate-actions">
                <button
                  onClick={handleAcceptTrust}
                  className="text-base font-semibold px-6 py-3 rounded-xl text-white transition hover:opacity-90"
                  style={{
                    backgroundColor: "var(--pulse)",
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  Sounds good →
                </button>
              </div>
            </>
          )}

          {/* Phase 2: Trust accepted, NPS pending — show welcome + NPS prompt + scale */}
          {trustAccepted && !npsSubmitted && (
            <>
              <ChatMessage role="assistant" content={welcomeContent} />
              <ChatMessage role="assistant" content={npsPrompt} />
              <div className="ml-10 mt-3">
                <NpsScale onSelect={handleNpsSelect} />
              </div>
            </>
          )}

          {/* Phase 3+: conversation */}
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
          ))}

          {loading && (
            <div className="flex justify-start mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0"
                style={{ backgroundColor: "var(--pulse)" }}
              >
                <svg
                  width="14"
                  height="14"
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
              <div
                className="rounded-2xl rounded-bl-md px-5 py-4"
                style={{
                  backgroundColor: "white",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex space-x-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full animate-bounce"
                    style={{ backgroundColor: "var(--ink-4)" }}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full animate-bounce [animation-delay:0.15s]"
                    style={{ backgroundColor: "var(--ink-4)" }}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full animate-bounce [animation-delay:0.3s]"
                    style={{ backgroundColor: "var(--ink-4)" }}
                  />
                </div>
              </div>
            </div>
          )}

          {completed && (
            <div className="text-center py-6">
              <p className="text-base" style={{ color: "var(--ink-2)" }}>
                Thanks for sharing your feedback.
              </p>

              {googleReviewUrl && npsScore >= 9 && reviewResponse !== "no" && (
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white rounded-xl shadow-md hover:shadow-lg transition"
                  style={{ backgroundColor: "var(--pulse)" }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Leave a Google Review
                </a>
              )}

              {googleReviewUrl && npsScore >= 9 && reviewResponse === "no" && (
                <p className="mt-4">
                  <a
                    href={googleReviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline transition"
                    style={{ color: "var(--ink-4)" }}
                  >
                    Changed your mind? We'd be grateful for a review.
                  </a>
                </p>
              )}

              {isMock && (
                <button
                  onClick={() => navigate(`/superadmin/clients/${clientId}`)}
                  className="mt-3 px-4 py-2 text-sm font-medium rounded-lg border"
                  style={{
                    color: "var(--plum)",
                    backgroundColor: "var(--plum-tint)",
                    borderColor: "var(--plum-soft)",
                  }}
                >
                  Return to Client Detail
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Bottom bar: input + end chat (only after NPS picked) */}
        {npsSubmitted && !completed && (
          <div className="bg-white flex-shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
            <form onSubmit={handleSubmit} className="px-5 py-4 flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response…"
                disabled={loading}
                rows={2}
                className="flex-1 px-4 py-3 text-base rounded-xl outline-none resize-none disabled:bg-gray-50 transition"
                style={{
                  border: "1.5px solid var(--line-2)",
                  maxHeight: 150,
                  color: "var(--ink)",
                }}
                autoFocus
              />
              {synth && (
                <button
                  type="button"
                  onClick={() => {
                    if (speechEnabled) stopSpeaking();
                    setSpeechEnabled((prev) => !prev);
                  }}
                  className="p-3 rounded-xl transition"
                  style={
                    speechEnabled
                      ? { backgroundColor: "var(--pulse-tint)", color: "var(--pulse-deep)" }
                      : { backgroundColor: "var(--paper-3)", color: "var(--ink-4)" }
                  }
                  title={
                    speechEnabled
                      ? speaking
                        ? "AI is speaking… (click to disable)"
                        : "AI voice on (click to disable)"
                      : "Enable AI voice"
                  }
                >
                  <div className="relative">
                    {speechEnabled ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 01-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                        <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
                      </svg>
                    )}
                    {speaking && (
                      <span
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
                        style={{ backgroundColor: "var(--pulse)" }}
                      />
                    )}
                  </div>
                </button>
              )}
              {SpeechRecognition && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className="p-3 rounded-xl transition"
                  style={
                    listening
                      ? { backgroundColor: "var(--coral-tint)", color: "var(--coral)" }
                      : { backgroundColor: "var(--paper-3)", color: "var(--ink-4)" }
                  }
                  title={listening ? "Stop recording" : "Start voice input"}
                >
                  <div className="relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
                      <path d="M6 11a1 1 0 10-2 0 8 8 0 0016 0 1 1 0 10-2 0 6 6 0 01-12 0z" />
                      <path d="M11 19.93A8.01 8.01 0 014 12a1 1 0 112 0 6 6 0 0012 0 1 1 0 112 0 8.01 8.01 0 01-7 7.93V22a1 1 0 11-2 0v-2.07z" />
                    </svg>
                    {listening && (
                      <span
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
                        style={{ backgroundColor: "var(--coral)" }}
                      />
                    )}
                  </div>
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-5 py-3 text-sm font-semibold text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--pulse)" }}
              >
                Send
              </button>
            </form>
            <div className="px-5 pb-3 text-center">
              <button
                onClick={handleEndChat}
                disabled={loading}
                className="text-xs hover:underline transition disabled:opacity-50"
                style={{ color: "var(--ink-4)" }}
              >
                End chat early
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Powered-by — outside the card, on the page wrapper */}
      <div className="flex items-center justify-center gap-2 mt-4 mb-2">
        <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
          Powered by
        </span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--ink-3)" }}>
          ResidentPulse
        </span>
        <span className="text-[11px]" style={{ color: "var(--ink-5)" }}>
          |
        </span>
        <img src="/CAMAscent.png" alt="CAM Ascent" className="h-4 object-contain opacity-70" />
      </div>
    </div>
  );
}

/**
 * Inline chat message — design-token styled, distinct from the legacy
 * ChatBubble used in admin Test Interview UI. Renders a small pulse-mark
 * avatar for assistant messages and an ink-black bubble for user
 * messages. Bubbles cap at 85% so long responses can breathe but short
 * ones don't stretch awkwardly.
 */
function ChatMessage({ role, content, timestamp }) {
  const isUser = role === "user";
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && <PulseAvatar />}
      <div
        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
        style={{ maxWidth: "85%" }}
      >
        <div
          className={`px-4 py-3 text-base leading-relaxed whitespace-pre-wrap break-words ${
            isUser ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md"
          }`}
          style={
            isUser
              ? { backgroundColor: "var(--ink)", color: "white" }
              : {
                  backgroundColor: "white",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                  boxShadow: "var(--shadow-sm)",
                }
          }
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

/**
 * Small pulse-mark avatar used for assistant messages in the chat.
 * Mirrors the BrandAvatar fallback but at message-bubble scale.
 */
function PulseAvatar() {
  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center mr-2 mt-0.5 flex-shrink-0"
      style={{ background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))" }}
      aria-hidden="true"
    >
      <svg
        width="14"
        height="14"
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

/**
 * BrandAvatar — small square logo block in the header.
 * Falls back to a pulse-green pulse-mark when no client logo is set.
 */
function BrandAvatar({ hasLogo, clientId, companyName }) {
  const [loaded, setLoaded] = useState(true);
  if (hasLogo && clientId && loaded) {
    return (
      <img
        src={`/api/sessions/logo/${clientId}`}
        alt={companyName || "Company logo"}
        className="h-9 w-9 object-contain rounded bg-white p-0.5"
        style={{ border: "1px solid var(--line)" }}
        onError={() => setLoaded(false)}
      />
    );
  }
  return (
    <div
      className="h-9 w-9 rounded flex items-center justify-center text-white flex-shrink-0"
      style={{ background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))" }}
    >
      <svg
        width="18"
        height="18"
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
