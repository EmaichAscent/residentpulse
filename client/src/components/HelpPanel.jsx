import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { helpArticles, CATEGORIES } from "../data/helpArticles";

export default function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const location = useLocation();

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
          </div>
        </>
      )}
    </>
  );
}
