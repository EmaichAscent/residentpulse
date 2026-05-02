import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { helpArticles, CATEGORIES } from "../data/helpArticles";

/**
 * HelpPanel — slide-out help drawer reachable from a floating "?"
 * button on every admin page. Two tabs:
 *
 *   Articles  — searchable knowledge base, with context-aware
 *               "suggested for this page" surfacing on top.
 *   Ask       — natural-language chat backed by /api/admin/help-chat
 *               which has the full article corpus in its system prompt.
 *
 * Phase-3 v2 redesign:
 *   • Floating button uses the pulse gradient (was generic cam-blue).
 *   • Panel chrome uses --paper / --ink / --line tokens; title set in
 *     Fraunces. Tabs use the dark "ink" underline (matches the rest
 *     of the v2 admin shell) instead of cam-blue.
 *   • Chat bubbles match the resident ChatPage aesthetic exactly:
 *     sharp 4/14 corners, white assistant bubble with shadow-sm,
 *     ink-on-white user bubble. PulseAvatar for the assistant rows so
 *     the help chat feels like a member of the same family.
 *   • Search + chat inputs match the v2 input style (--line-2 border,
 *     pulse focus ring).
 */
export default function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("articles");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const location = useLocation();

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Detect current page context from route
  const getPageContext = () => {
    const path = location.pathname.replace("/admin/", "").replace("/admin", "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return "rounds";
    if (segments.length >= 2) return segments[0] + "/:id";
    return segments[0];
  };

  const getMatchingPages = () => {
    const context = getPageContext();
    const mappings = {
      rounds: ["rounds"],
      "rounds/:id": ["rounds/:roundId"],
      trends: ["trends"],
      communities: ["communities"],
      members: ["members"],
      account: ["account"],
      onboarding: ["rounds"],
    };
    return mappings[context] || [];
  };

  const contextPages = getMatchingPages();
  const contextArticles = helpArticles.filter((a) => a.pages.some((p) => contextPages.includes(p)));

  const searchLower = searchQuery.toLowerCase().trim();
  const filteredArticles = searchLower
    ? helpArticles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchLower) ||
          a.tags.some((t) => t.includes(searchLower)) ||
          a.body.toLowerCase().includes(searchLower)
      )
    : null;

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setExpandedId(null);
    }
  }, [isOpen]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [chatMessages, chatLoading]);

  // ── Markdown rendering helpers ──────────────────────────────────────
  const renderBody = (text) => {
    return text.split("\n\n").map((paragraph, i) => {
      const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className={i > 0 ? "mt-2.5" : ""} style={{ color: "var(--ink-2)" }}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="font-semibold" style={{ color: "var(--ink)" }}>
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={j}>{part}</span>;
          })}
        </p>
      );
    });
  };

  const renderChatMessage = (text) => {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className={i > 0 ? "mt-1" : ""}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="font-semibold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={j}>{part}</span>;
          })}
        </p>
      );
    });
  };

  // ── Article row ─────────────────────────────────────────────────────
  const renderArticle = (article) => {
    const isExpanded = expandedId === article.id;
    return (
      <div key={article.id} style={{ borderBottom: "1px solid var(--line)" }}>
        <button
          onClick={() => setExpandedId(isExpanded ? null : article.id)}
          className="w-full text-left flex items-center justify-between transition"
          style={{
            padding: "12px 16px",
            backgroundColor: isExpanded ? "var(--paper-2)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (!isExpanded) e.currentTarget.style.backgroundColor = "var(--paper-2)";
          }}
          onMouseLeave={(e) => {
            if (!isExpanded) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span
            className="text-[13.5px] font-semibold pr-4"
            style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
          >
            {article.title}
          </span>
          <ChevronDown rotated={isExpanded} />
        </button>
        {isExpanded && (
          <div
            className="text-[13px] leading-relaxed"
            style={{ padding: "0 16px 16px", backgroundColor: "var(--paper-2)" }}
          >
            {renderBody(article.body)}
          </div>
        )}
      </div>
    );
  };

  const renderArticleList = () => {
    if (filteredArticles) {
      if (filteredArticles.length === 0) {
        return (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              No articles match your search.
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--ink-4)" }}>
              Try different keywords or clear the search to browse all topics.
            </p>
          </div>
        );
      }
      return <div>{filteredArticles.map(renderArticle)}</div>;
    }

    return (
      <>
        {contextArticles.length > 0 && (
          <div className="mb-1">
            <CategoryHeader>Suggested for this page</CategoryHeader>
            <div>{contextArticles.map(renderArticle)}</div>
          </div>
        )}

        {CATEGORIES.map((cat) => {
          const catArticles = helpArticles.filter((a) => a.category === cat);
          if (catArticles.length === 0) return null;
          return (
            <div key={cat} className="mb-1">
              <CategoryHeader>{cat}</CategoryHeader>
              <div>{catArticles.map(renderArticle)}</div>
            </div>
          );
        })}
      </>
    );
  };

  // ── Chat ────────────────────────────────────────────────────────────
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/admin/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question,
          history: chatMessages,
          articles: helpArticles.map((a) => ({ title: a.title, body: a.body })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I ran into an error. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const renderChat = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--paper)" }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: "16px 14px" }}>
        <div className="flex flex-col" style={{ gap: 12 }}>
          {chatMessages.length === 0 && (
            <div className="text-center" style={{ padding: "24px 8px" }}>
              <PulseAvatar size={40} />
              <p
                className="font-medium mt-3"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  letterSpacing: "-0.01em",
                  color: "var(--ink)",
                }}
              >
                Ask me anything
              </p>
              <p
                className="text-[12.5px] mt-1.5 max-w-[260px] mx-auto"
                style={{ color: "var(--ink-3)" }}
              >
                Survey rounds, NPS, board members, settings — I can walk you through any of it.
              </p>
            </div>
          )}

          {chatMessages.map((msg, i) => {
            const isUser = msg.role === "user";
            if (isUser) {
              return (
                <div key={i} className="flex justify-end">
                  <div
                    className="text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words"
                    style={{
                      maxWidth: "min(86%, 280px)",
                      backgroundColor: "var(--ink)",
                      color: "white",
                      padding: "9px 12px",
                      borderRadius: "14px 14px 4px 14px",
                    }}
                  >
                    {renderChatMessage(msg.content)}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex items-start gap-2">
                <PulseAvatar size={28} />
                <div
                  className="text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words"
                  style={{
                    maxWidth: "min(86%, 280px)",
                    backgroundColor: "white",
                    color: "var(--ink)",
                    padding: "10px 12px",
                    borderRadius: "4px 14px 14px 14px",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {renderChatMessage(msg.content)}
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-start gap-2">
              <PulseAvatar size={28} />
              <div
                className="flex items-center gap-1.5"
                style={{
                  backgroundColor: "white",
                  padding: "12px 14px",
                  borderRadius: "4px 14px 14px 14px",
                  boxShadow: "var(--shadow-sm)",
                }}
                aria-label="Loading"
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: "var(--ink-4)",
                      animation: `rp-helpdots 1.2s infinite ${d * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleChatSubmit}
        className="bg-white flex-shrink-0"
        style={{ borderTop: "1px solid var(--line)", padding: "10px 12px" }}
      >
        <div className="relative">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your question…"
            disabled={chatLoading}
            className="w-full text-[13.5px] outline-none transition disabled:opacity-50"
            style={{
              border: "1px solid var(--line-2)",
              borderRadius: 14,
              padding: "9px 42px 9px 14px",
              backgroundColor: "var(--paper)",
              color: "var(--ink)",
            }}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="absolute rounded-md flex items-center justify-center transition"
            style={{
              right: 6,
              bottom: 6,
              width: 28,
              height: 28,
              backgroundColor: chatInput.trim() ? "var(--ink)" : "var(--paper-3)",
              color: chatInput.trim() ? "white" : "var(--ink-4)",
              cursor: chatInput.trim() && !chatLoading ? "pointer" : "default",
            }}
            aria-label="Send question"
          >
            <SendIcon />
          </button>
        </div>
      </form>
      <style>{`
        @keyframes rp-helpdots {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  );

  return (
    <>
      {/* Floating launcher */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 rounded-full text-white transition hover:opacity-90 flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
            boxShadow: "0 6px 20px rgba(31,165,113,0.35)",
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 600,
          }}
          title="Help"
          aria-label="Open help panel"
        >
          ?
        </button>
      )}

      {/* Backdrop + Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(36,42,52,0.45)" }}
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed top-0 right-0 h-full w-full sm:w-[400px] z-50 flex flex-col"
            style={{
              backgroundColor: "var(--paper)",
              borderLeft: "1px solid var(--line)",
              boxShadow: "var(--shadow-lg)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center justify-between bg-white"
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
                    boxShadow: "0 2px 6px rgba(31,165,113,0.2)",
                    color: "white",
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                  aria-hidden="true"
                >
                  ?
                </span>
                <h2
                  className="font-medium"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    letterSpacing: "-0.015em",
                    color: "var(--ink)",
                  }}
                >
                  Help
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md transition"
                style={{
                  padding: 6,
                  color: "var(--ink-4)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--paper-2)";
                  e.currentTarget.style.color = "var(--ink-2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--ink-4)";
                }}
                aria-label="Close help panel"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Tabs */}
            <div
              className="flex flex-shrink-0 bg-white"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <Tab active={activeTab === "articles"} onClick={() => setActiveTab("articles")}>
                Articles
              </Tab>
              <Tab active={activeTab === "chat"} onClick={() => setActiveTab("chat")}>
                Ask a question
              </Tab>
            </div>

            {/* Content */}
            {activeTab === "articles" ? (
              <>
                <div
                  className="flex-shrink-0 bg-white"
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search help articles…"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setExpandedId(null);
                    }}
                    className="w-full text-[13.5px] outline-none transition"
                    style={{
                      border: "1px solid var(--line-2)",
                      borderRadius: 12,
                      padding: "8px 12px",
                      backgroundColor: "var(--paper)",
                      color: "var(--ink)",
                    }}
                  />
                </div>
                <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "white" }}>
                  {renderArticleList()}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">{renderChat()}</div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 transition"
      style={{
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--ink)" : "var(--ink-4)",
        borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
        marginBottom: -1,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = "var(--ink-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--ink-4)";
      }}
    >
      {children}
    </button>
  );
}

function CategoryHeader({ children }) {
  return (
    <div
      className="font-semibold uppercase"
      style={{
        padding: "10px 16px 6px",
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--ink-4)",
        backgroundColor: "white",
      }}
    >
      {children}
    </div>
  );
}

function PulseAvatar({ size = 32 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 mx-auto"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--pulse), var(--pulse-deep))",
        boxShadow: "0 2px 8px rgba(31,165,113,0.25)",
      }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
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

function ChevronDown({ rotated }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 transition-transform"
      style={{
        color: "var(--ink-4)",
        transform: rotated ? "rotate(180deg)" : "rotate(0)",
      }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
