import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { helpArticles, CATEGORIES } from "../data/helpArticles";

export default function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("articles"); // "articles" | "chat"
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const location = useLocation();

  // Chat state
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

  // Map route patterns to article page values
  const getMatchingPages = () => {
    const context = getPageContext();
    const mappings = {
      "rounds": ["rounds"],
      "rounds/:id": ["rounds/:roundId"],
      "trends": ["trends"],
      "communities": ["communities"],
      "members": ["members"],
      "account": ["account"],
      "onboarding": ["rounds"],
    };
    return mappings[context] || [];
  };

  const contextPages = getMatchingPages();
  const contextArticles = helpArticles.filter((a) =>
    a.pages.some((p) => contextPages.includes(p))
  );

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim();
  const filteredArticles = searchLower
    ? helpArticles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchLower) ||
          a.tags.some((t) => t.includes(searchLower)) ||
          a.body.toLowerCase().includes(searchLower)
      )
    : null;

  // Close on Escape key
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

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatLoading]);

  // Render **bold** markers and paragraph breaks
  const renderBody = (text) => {
    return text.split("\n\n").map((paragraph, i) => {
      const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className={i > 0 ? "mt-3" : ""}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="font-semibold text-gray-900">
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

  const renderArticle = (article) => {
    const isExpanded = expandedId === article.id;
    return (
      <div key={article.id} className="border-b border-gray-100 last:border-0">
        <button
          onClick={() => setExpandedId(isExpanded ? null : article.id)}
          className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
        >
          <span className="text-sm font-medium text-gray-900 pr-4">
            {article.title}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed">
            {renderBody(article.body)}
          </div>
        )}
      </div>
    );
  };

  const renderArticleList = () => {
    // Search mode: flat filtered list
    if (filteredArticles) {
      if (filteredArticles.length === 0) {
        return (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">
              No articles match your search.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Try different keywords or clear your search to browse all topics.
            </p>
          </div>
        );
      }
      return <div>{filteredArticles.map(renderArticle)}</div>;
    }

    // Default mode: context suggestions + categories
    return (
      <>
        {contextArticles.length > 0 && (
          <div className="mb-2">
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Suggested for this page
              </span>
            </div>
            <div>{contextArticles.map(renderArticle)}</div>
          </div>
        )}

        {CATEGORIES.map((cat) => {
          const catArticles = helpArticles.filter((a) => a.category === cat);
          if (catArticles.length === 0) return null;
          return (
            <div key={cat} className="mb-2">
              <div className="px-4 py-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {cat}
                </span>
              </div>
              <div>{catArticles.map(renderArticle)}</div>
            </div>
          );
        })}
      </>
    );
  };

  // Chat submit handler
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMsg = { role: "user", content: question };
    setChatMessages((prev) => [...prev, userMsg]);
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
          articles: helpArticles.map(a => ({ title: a.title, body: a.body })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I ran into an error. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Render chat message with basic markdown-like formatting
  const renderChatMessage = (text) => {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className={i > 0 ? "mt-1" : ""}>
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={j}>{part}</span>;
          })}
        </p>
      );
    });
  };

  const renderChat = () => (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Ask me anything</p>
            <p className="text-xs text-gray-400">
              I can help with survey rounds, NPS scores, board members, settings, and more.
            </p>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {renderChatMessage(msg.content)}
            </div>
          </div>
        ))}

        {chatLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleChatSubmit} className="border-t border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-[var(--cam-blue)] transition"
            disabled={chatLoading}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="px-3 py-2 rounded-lg text-white text-sm font-medium transition disabled:opacity-50"
            style={{ backgroundColor: "var(--cam-blue)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {/* Floating ? Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full text-white text-xl font-bold shadow-lg hover:opacity-90 transition flex items-center justify-center"
          style={{ backgroundColor: "var(--cam-blue)" }}
          title="Help"
        >
          ?
        </button>
      )}

      {/* Backdrop + Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-50"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Help</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 transition"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setActiveTab("articles")}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === "articles"
                    ? "text-[var(--cam-blue)] border-b-2 border-[var(--cam-blue)]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Articles
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === "chat"
                    ? "text-[var(--cam-blue)] border-b-2 border-[var(--cam-blue)]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Ask a Question
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "articles" ? (
              <>
                {/* Search */}
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search help articles..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setExpandedId(null);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-[var(--cam-blue)] transition"
                  />
                </div>

                {/* Article List */}
                <div className="flex-1 overflow-y-auto">
                  {renderArticleList()}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {renderChat()}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
