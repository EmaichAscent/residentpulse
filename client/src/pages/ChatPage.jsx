import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NpsScale from "../components/NpsScale";
import { buildWelcomeMessage } from "../utils/chatWelcome";

/**
 * Resident chat — full rebuild matching the polished variant of
 * DESIGN/design_handoff_clientapp/src/screens/ChatPrototype.jsx
 * (lines 105-233). The previous implementation accumulated 6+ patches
 * worth of layout fixes that didn't add up to a coherent shape; this
 * file scraps all of that and walks the spec from scratch.
 *
 * Layout strategy (the part the spec couldn't decide for us):
 *   • Mobile (<sm)    full-bleed — card fills 100dvh, no rounded
 *                     corners, no surrounding paper. The chat IS
 *                     the screen, like any messenger app.
 *   • Desktop (≥sm)   centered chat-shaped card. max-w-[520px], with
 *                     a comfortable max-height so the card has paper
 *                     around it but isn't a literal phone frame
 *                     (the spec's 420×720 frame was anemic at desktop
 *                     zoom).
 *
 * Inside the card the layout is always the same:
 *   ┌────────────────────────┐
 *   │ progress bar (2px)     │ flex-shrink-0
 *   │ header                 │ flex-shrink-0
 *   │ mock banner (if isMock)│ flex-shrink-0
 *   │ ┌────────────────────┐ │
 *   │ │ messages           │ │ flex-1, overflow-y-auto
 *   │ │ trust gate /        │ │
 *   │ │ nps picker /        │ │
 *   │ │ conversation       │ │
 *   │ └────────────────────┘ │
 *   │ input bar (post-NPS)   │ flex-shrink-0
 *   │ footer                 │ flex-shrink-0
 *   └────────────────────────┘
 *
 * Behaviors preserved verbatim from the prior implementation:
 *   1. Trust gate flow (welcome → "Sounds good" → NPS picker → chat)
 *   2. Welcome copy from buildWelcomeMessage() (chatWelcome.js — has
 *      its own unit tests covering the trust contract phrasing)
 *   3. NpsScale component for the picker (auto-advance, 11 buttons)
 *   4. Resume: sessions with existing nps_score skip trust gate +
 *      jump straight to the conversation
 *   5. Voice (synth) + mic (recognition), end-chat, mock survey
 *      banner, Google Review CTA for promoters
 *   6. POST /api/chat for replies, PATCH /api/sessions/:id/nps for
 *      NPS, PATCH /api/sessions/:id/complete on End early
 *   7. community_manager_name from GET /api/sessions/:id used to
 *      personalize the welcome ("Sarah at Zee Best…")
 *
 * Not modified: the shared ChatBubble component (admin Test Interview
 * uses it). This page builds its own ChatMessage inline so the two
 * stay decoupled.
 */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

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

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastSpokenIndexRef = useRef(-1);

  // ── Session bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }
    (async () => {
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
        // Resume: if NPS already on file, skip the trust gate entirely
        // and land in the conversation view.
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
      } catch {
        // Network failure on initial load is silent — the user can
        // still tap "Sounds good" to engage; the session will fault
        // again on the first message and we surface the error there.
      }
    })();
  }, [sessionId, navigate]);

  // ── Auto-scroll on new messages / typing dots / phase changes ──────
  // (scrollIntoView is undefined in jsdom; guard so tests don't blow up.)
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, loading, trustAccepted, npsSubmitted, completed]);

  // ── Auto-resize textarea ───────────────────────────────────────────
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

  // ── Speech synthesis (AI replies read aloud) ───────────────────────
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
  useEffect(() => {
    if (!speechEnabled || messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last.role === "assistant" && lastIdx > lastSpokenIndexRef.current) {
      lastSpokenIndexRef.current = lastIdx;
      speakText(last.content);
    }
  }, [messages, speechEnabled, speakText]);

  // ── Send a user reply, get AI follow-up ────────────────────────────
  const sendMessage = async (text) => {
    stopSpeaking();
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
    ]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reply failed");
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

  // ── Trust gate / NPS / submit / end-chat ───────────────────────────
  const handleAcceptTrust = () => setTrustAccepted(true);

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
    e?.preventDefault?.();
    if (!input.trim() || loading || completed) return;
    sendMessage(input.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleEndChat = async () => {
    setCompleted(true);
    stopSpeaking();
    if (listening) recognitionRef.current?.stop();
    await fetch(`/api/sessions/${sessionId}/complete`, { method: "PATCH" });
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
    if (!SpeechRecognition) return;
    stopSpeaking();
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    let finalTranscript = input;
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  if (!sessionId) return null;

  // ── Derived ────────────────────────────────────────────────────────
  const welcomeContent = buildWelcomeMessage({
    firstName,
    company,
    community,
    communityManagerName,
  });
  const npsPrompt = `On a scale of 0 to 10, how likely are you to recommend ${
    company || "your management company"
  } to another HOA board?`;

  // Progress: 0% before trust acceptance, 10% trust→NPS, 25% post-NPS,
  // +6% per AI turn capped at 95%, 100% on completion.
  const progressPercent = (() => {
    if (completed) return 100;
    if (!trustAccepted) return 0;
    if (!npsSubmitted) return 10;
    const aiTurns = messages.filter((m) => m.role === "assistant").length;
    return Math.min(95, 25 + aiTurns * 6);
  })();

  const headerSubtitle = (() => {
    const parts = [];
    if (community) parts.push(community);
    parts.push(`check-in for ${firstName || "you"}`);
    return parts.join(" · ");
  })();

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex min-h-[100dvh] sm:min-h-screen sm:items-center sm:justify-center sm:py-6 sm:px-4"
      style={{
        background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        className="flex flex-col w-full h-[100dvh] bg-white overflow-hidden sm:h-auto sm:rounded-3xl sm:max-w-[520px] sm:max-h-[min(800px,calc(100vh-3rem))]"
        style={{
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-lg)",
        }}
        data-testid="chat-card"
      >
        <ProgressBar percent={progressPercent} />
        <Header
          companyDisplay={company || companyName || "ResidentPulse"}
          subtitle={headerSubtitle}
          hasLogo={hasLogo}
          clientId={clientId}
          companyName={companyName}
          voiceAvailable={!!synth}
          voiceEnabled={speechEnabled}
          voiceSpeaking={speaking}
          onToggleVoice={() => {
            if (speechEnabled) stopSpeaking();
            setSpeechEnabled((v) => !v);
          }}
        />
        {isMock && <MockBanner />}

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ padding: "20px 16px", background: "var(--paper)" }}
        >
          <div className="flex flex-col" style={{ gap: 14 }}>
            {/* Phase 1 — trust gate */}
            {!trustAccepted && (
              <>
                <ChatMessage role="assistant" content={welcomeContent} />
                <div className="flex justify-end" data-testid="trust-gate-actions">
                  <button
                    type="button"
                    onClick={handleAcceptTrust}
                    className="font-semibold rounded-xl text-white transition hover:opacity-90"
                    style={{
                      backgroundColor: "var(--pulse)",
                      boxShadow: "var(--shadow-sm)",
                      padding: "10px 18px",
                      fontSize: 14,
                    }}
                  >
                    Sounds good →
                  </button>
                </div>
              </>
            )}

            {/* Phase 2 — trust accepted, NPS pending */}
            {trustAccepted && !npsSubmitted && (
              <>
                <ChatMessage role="assistant" content={welcomeContent} />
                <ChatMessage role="assistant" content={npsPrompt} />
                <div className="pl-[42px]">
                  <NpsScale onSelect={handleNpsSelect} />
                </div>
              </>
            )}

            {/* Phase 3+ — conversation messages */}
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ))}

            {loading && <TypingDots />}

            {completed && (
              <CompletionCard
                npsScore={npsScore}
                googleReviewUrl={googleReviewUrl}
                reviewResponse={reviewResponse}
                isMock={isMock}
                onReturn={() => clientId && navigate(`/superadmin/clients/${clientId}`)}
              />
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {npsSubmitted && !completed && (
          <InputBar
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSubmit={handleSubmit}
            textareaRef={textareaRef}
            disabled={loading}
            micAvailable={!!SpeechRecognition}
            micActive={listening}
            onToggleMic={toggleListening}
          />
        )}

        <Footer
          showEndEarly={npsSubmitted && !completed}
          onEndChat={handleEndChat}
          endDisabled={loading}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ProgressBar — 2px stripe, animated width
// ──────────────────────────────────────────────────────────────────────

function ProgressBar({ percent }) {
  return (
    <div
      className="flex-shrink-0 relative overflow-hidden"
      style={{ height: 2, backgroundColor: "var(--paper-3)" }}
      aria-hidden="true"
    >
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: "var(--pulse)" }}
        data-testid="progress-bar"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header — logo + title/subtitle + Confidential + voice toggle
// ──────────────────────────────────────────────────────────────────────

function Header({
  companyDisplay,
  subtitle,
  hasLogo,
  clientId,
  companyName,
  voiceAvailable,
  voiceEnabled,
  voiceSpeaking,
  onToggleVoice,
}) {
  return (
    <div
      className="bg-white flex-shrink-0 flex items-center gap-2.5"
      style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}
      data-testid="chat-header"
    >
      <BrandAvatar hasLogo={hasLogo} clientId={clientId} companyName={companyName} />
      <div className="flex-1 min-w-0">
        <p
          className="text-[13.5px] font-semibold truncate leading-tight"
          style={{ color: "var(--ink)" }}
          title={companyDisplay}
        >
          {companyDisplay}
        </p>
        <p
          className="text-[11.5px] truncate leading-tight mt-0.5"
          style={{ color: "var(--ink-3)" }}
          title={subtitle}
        >
          {subtitle}
        </p>
      </div>
      {voiceAvailable && (
        <button
          type="button"
          onClick={onToggleVoice}
          className="flex-shrink-0 rounded-md transition relative"
          style={{
            padding: 6,
            backgroundColor: voiceEnabled ? "var(--pulse-tint)" : "transparent",
            color: voiceEnabled ? "var(--pulse-deep)" : "var(--ink-4)",
          }}
          title={
            voiceEnabled
              ? voiceSpeaking
                ? "AI is speaking — click to mute"
                : "AI voice on — click to mute"
              : "Enable AI voice (read responses aloud)"
          }
          aria-label={voiceEnabled ? "Mute AI voice" : "Enable AI voice"}
          aria-pressed={voiceEnabled}
        >
          {voiceEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          {voiceSpeaking && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--pulse)", animation: "rp-pulse 1.6s infinite" }}
            />
          )}
        </button>
      )}
      <div
        className="flex-shrink-0 flex items-center gap-1 text-[11px]"
        style={{ color: "var(--ink-4)" }}
        title="Your responses are private. The management company sees a summary, not the transcript."
      >
        <CheckIcon />
        Confidential
      </div>
      <style>{`
        @keyframes rp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function MockBanner() {
  return (
    <div
      className="flex-shrink-0 text-center"
      style={{
        padding: "8px 16px",
        backgroundColor: "var(--plum-tint)",
        borderBottom: "1px solid var(--plum-soft)",
      }}
    >
      <p className="text-[12px] font-medium m-0" style={{ color: "var(--plum)" }}>
        Mock Survey Mode — this session will not affect analytics
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ChatMessage — assistant or user bubble per spec lines 113-172
// ──────────────────────────────────────────────────────────────────────

function ChatMessage({ role, content, timestamp }) {
  const isUser = role === "user";
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex flex-col items-end" style={{ maxWidth: "min(86%, 320px)" }}>
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
      <div className="flex flex-col" style={{ maxWidth: "min(86%, 360px)" }}>
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

// ──────────────────────────────────────────────────────────────────────
// CompletionCard — thank you + Google Review CTA for promoters
// ──────────────────────────────────────────────────────────────────────

function CompletionCard({ npsScore, googleReviewUrl, reviewResponse, isMock, onReturn }) {
  const isPromoter = npsScore != null && npsScore >= 9;
  const showReviewCta = isPromoter && googleReviewUrl && reviewResponse !== "no";
  const showSubtleReviewLink = isPromoter && googleReviewUrl && reviewResponse === "no";

  return (
    <div className="text-center" style={{ padding: "24px 8px 8px" }}>
      <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>
        Thanks for sharing your feedback.
      </p>
      {showReviewCta && (
        <a
          href={googleReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 font-semibold text-white rounded-xl transition hover:opacity-90"
          style={{
            backgroundColor: "var(--pulse)",
            boxShadow: "var(--shadow-md)",
            padding: "12px 20px",
            fontSize: 14,
          }}
        >
          <StarIcon />
          Leave a Google Review
        </a>
      )}
      {showSubtleReviewLink && (
        <p className="mt-4">
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] underline transition hover:opacity-80"
            style={{ color: "var(--ink-4)" }}
          >
            Changed your mind? We'd be grateful for a review.
          </a>
        </p>
      )}
      {isMock && (
        <button
          type="button"
          onClick={onReturn}
          className="mt-4 text-[12.5px] font-medium rounded-lg"
          style={{
            color: "var(--plum)",
            backgroundColor: "var(--plum-tint)",
            border: "1px solid var(--plum-soft)",
            padding: "8px 14px",
          }}
        >
          ← Return to Client Detail
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// InputBar — textarea + mic + send. Mic and send positioned inside the
// textarea per spec lines 202-226.
// ──────────────────────────────────────────────────────────────────────

function InputBar({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  textareaRef,
  disabled,
  micAvailable,
  micActive,
  onToggleMic,
}) {
  const hasContent = value.trim().length > 0;
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white flex-shrink-0"
      style={{ borderTop: "1px solid var(--line)", padding: "10px 12px" }}
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your answer…"
          disabled={disabled}
          rows={1}
          className="w-full text-[14px] resize-none outline-none transition disabled:opacity-50"
          style={{
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "10px 78px 10px 14px",
            backgroundColor: "var(--paper)",
            color: "var(--ink)",
            lineHeight: 1.4,
            minHeight: 40,
            maxHeight: 120,
          }}
          autoFocus
        />
        <div className="absolute flex items-center gap-1" style={{ right: 6, bottom: 6 }}>
          {micAvailable && (
            <button
              type="button"
              onClick={onToggleMic}
              className="rounded-md transition flex items-center justify-center relative"
              style={{
                width: 30,
                height: 30,
                backgroundColor: micActive ? "var(--coral-tint)" : "transparent",
                color: micActive ? "var(--coral)" : "var(--ink-4)",
              }}
              title={micActive ? "Stop recording" : "Start voice input"}
              aria-label={micActive ? "Stop recording" : "Start voice input"}
              aria-pressed={micActive}
            >
              <MicIcon />
              {micActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: "var(--coral)",
                    animation: "rp-pulse 1.6s infinite",
                  }}
                />
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={disabled || !hasContent}
            className="rounded-md flex items-center justify-center transition"
            style={{
              width: 30,
              height: 30,
              backgroundColor: hasContent ? "var(--ink)" : "var(--paper-3)",
              color: hasContent ? "white" : "var(--ink-4)",
              cursor: hasContent && !disabled ? "pointer" : "default",
            }}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Footer — Powered by + End early
// ──────────────────────────────────────────────────────────────────────

function Footer({ showEndEarly, onEndChat, endDisabled }) {
  return (
    <div
      className="bg-white flex-shrink-0 flex items-center justify-between"
      style={{ padding: "6px 14px 10px", borderTop: "1px solid var(--line)" }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10.5px] truncate" style={{ color: "var(--ink-4)" }}>
          Powered by ResidentPulse
        </span>
        <span className="text-[10.5px]" style={{ color: "var(--ink-5)" }}>
          |
        </span>
        <img src="/CAMAscent.png" alt="CAM Ascent" className="h-3 object-contain opacity-70" />
      </div>
      {showEndEarly && (
        <button
          type="button"
          onClick={onEndChat}
          disabled={endDisabled}
          className="text-[10.5px] underline transition hover:opacity-80 disabled:opacity-40"
          style={{ color: "var(--ink-4)" }}
        >
          End early
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Avatars + icons
// ──────────────────────────────────────────────────────────────────────

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

function BrandAvatar({ hasLogo, clientId, companyName }) {
  const [loaded, setLoaded] = useState(true);
  if (hasLogo && clientId && loaded) {
    return (
      <img
        src={`/api/sessions/logo/${clientId}`}
        alt={companyName || "Company logo"}
        className="object-contain rounded bg-white flex-shrink-0"
        style={{
          width: 30,
          height: 30,
          border: "1px solid var(--line)",
          padding: 2,
        }}
        onError={() => setLoaded(false)}
      />
    );
  }
  return (
    <div
      className="rounded flex items-center justify-center text-white flex-shrink-0"
      style={{
        width: 30,
        height: 30,
        background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
      }}
      aria-hidden="true"
    >
      <svg
        width="15"
        height="15"
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

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
      <path d="M6 11a1 1 0 10-2 0 8 8 0 0016 0 1 1 0 10-2 0 6 6 0 01-12 0z" />
      <path d="M11 19.93A8.01 8.01 0 014 12a1 1 0 112 0 6 6 0 0012 0 1 1 0 112 0 8.01 8.01 0 01-7 7.93V22a1 1 0 11-2 0v-2.07z" />
    </svg>
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

function SpeakerOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06z" />
      <path d="M18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 01-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
      <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
