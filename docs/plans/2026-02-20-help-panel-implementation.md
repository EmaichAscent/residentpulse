# Help Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a contextual help panel with 15 articles to the ResidentPulse admin UI, accessible via a floating ? button on every admin page.

**Architecture:** Static article data in a JS module, a single HelpPanel component with floating button + slide-out panel, integrated into AdminPage.jsx layout. Context-aware suggestions based on current route. Client-side search. No backend, no new dependencies.

**Tech Stack:** React, TailwindCSS, React Router useLocation()

---

### Task 1: Create help article data file

**Files:**
- Create: `client/src/data/helpArticles.js`

**Step 1: Create the data directory and article file**

Create `client/src/data/helpArticles.js` with all 15 articles. Each article has: `id`, `title`, `category`, `pages` (route segments for context matching), `tags` (search keywords), and `body` (plain text, use `\n\n` for paragraph breaks, `**bold**` for emphasis).

The category order defines display order: "Getting Started", "Key Concepts", "Email & Invitations", "Privacy & Data", "Managing Your Account".

Content guidelines — write for a non-technical user who has never used AI tools:
- Say "guided conversation" not "AI-powered interview"
- Say "our system" not "the AI model"
- Short paragraphs, 2-3 sentences each
- Bold key terms on first mention
- Action-oriented: tell them what to do, not how the internals work

```js
export const CATEGORIES = [
  "Getting Started",
  "Key Concepts",
  "Email & Invitations",
  "Privacy & Data",
  "Managing Your Account",
];

export const helpArticles = [
  {
    id: "welcome",
    title: "Welcome to ResidentPulse",
    category: "Getting Started",
    pages: ["rounds"],
    tags: ["welcome", "getting started", "overview", "what is", "about"],
    body: "ResidentPulse helps property management companies collect honest, meaningful feedback from HOA and condo board members.\n\nInstead of traditional surveys that get ignored, each board member has a short, private, guided conversation. They share what's working, what isn't, and what they'd like to see improve.\n\nYou get a simple dashboard with scores, trends, and summaries — so you always know where you stand with your communities."
  },
  {
    id: "setting-up",
    title: "Setting Up Your Account",
    category: "Getting Started",
    pages: ["rounds", "account"],
    tags: ["setup", "onboarding", "interview", "getting started", "first time"],
    body: "Getting started takes three steps:\n\n**1. Tell Us About Your Business** — You'll have a short conversation where you share details about your company, the communities you manage, and what matters most to you. This helps us personalize the questions your board members receive so the feedback is relevant and useful.\n\n**2. Add Your Board Members** — Go to the Members tab and add the board members you'd like to hear from. You'll need their name, email address, and community name. You can add them one at a time or paste in a list.\n\n**3. Schedule Your First Round** — Pick a launch date and we'll set up your survey schedule. When it's time, you'll confirm and launch — and every board member on your list gets a personal invitation."
  },
  {
    id: "launching-first-round",
    title: "Launching Your First Round",
    category: "Getting Started",
    pages: ["rounds"],
    tags: ["launch", "confirm", "start", "send", "first round", "begin"],
    body: "When your scheduled round is within 30 days of its launch date, a **Confirm & Launch** button will appear next to it on your Home page.\n\nClicking it sends a personal email invitation to every active board member on your list. Each member gets their own unique link — they don't need to create an account or remember a password.\n\nOnce launched, the round stays open for 30 days. You can track responses on your dashboard as they come in."
  },
  {
    id: "what-is-nps",
    title: "What is an NPS Score?",
    category: "Key Concepts",
    pages: ["rounds", "rounds/:roundId", "trends"],
    tags: ["nps", "score", "promoter", "detractor", "passive", "net promoter", "rating", "number"],
    body: "**NPS** stands for **Net Promoter Score**. It's a simple way to measure how your board members feel about your management company.\n\nWhen a board member starts their feedback session, they're asked one question: \"On a scale of 0 to 10, how likely are you to recommend our services?\" Based on their answer, they fall into one of three groups:\n\n**Promoters (9-10)** — Very happy with your service. These are your strongest advocates.\n\n**Passives (7-8)** — Satisfied but not enthusiastic. They could go either way.\n\n**Detractors (0-6)** — Unhappy and likely to share negative feedback with others.\n\nYour overall NPS is calculated by subtracting the percentage of Detractors from the percentage of Promoters. Scores can range from -100 to +100. Any positive score is good, and above 50 is excellent."
  },
  {
    id: "survey-rounds",
    title: "Understanding Survey Rounds",
    category: "Key Concepts",
    pages: ["rounds", "rounds/:roundId"],
    tags: ["round", "survey", "cycle", "30 days", "planned", "in progress", "concluded", "status"],
    body: "A **survey round** is a 30-day window where your board members can share their feedback. Think of it as one cycle of collecting input from your communities.\n\nEach round goes through three stages:\n\n**Planned** — The round is scheduled but hasn't started yet. You'll see the scheduled date on your Home page. The Confirm & Launch button appears when it's within 30 days of the launch date.\n\n**In Progress** — The round is live. Board members are receiving invitations and completing their feedback sessions. You can watch responses come in on your dashboard in real time.\n\n**Concluded** — The round has ended (either after 30 days or if you close it early). Results are final and you can view the full dashboard with scores, summaries, and insights."
  },
  {
    id: "cadence",
    title: "Survey Cadence",
    category: "Key Concepts",
    pages: ["rounds", "account"],
    tags: ["cadence", "frequency", "2x", "4x", "per year", "schedule", "how often"],
    body: "**Cadence** is how often you run survey rounds each year. ResidentPulse offers two options:\n\n**2x per year** — A round every 6 months. Good for getting a reliable pulse on your communities without over-surveying.\n\n**4x per year** — A round every 3 months. Gives you more frequent data points and faster trend tracking. Available on paid plans.\n\nYou can change your cadence from the Home page using the toggle in the Upcoming Rounds section. When you switch, your future scheduled rounds will automatically adjust.\n\nRunning rounds consistently is the key to useful trend data. The more rounds you complete, the clearer the picture becomes."
  },
  {
    id: "communities",
    title: "Communities",
    category: "Key Concepts",
    pages: ["communities", "rounds/:roundId"],
    tags: ["community", "hoa", "condo", "association", "property", "contract", "manager"],
    body: "**Communities** are the HOAs, condo associations, or properties your company manages. ResidentPulse automatically creates a community record for each unique community name in your board member list.\n\nOn the Communities page (available on paid plans), you can:\n\n- View all your communities in one place\n- Add details like contract value, renewal date, property type, and number of units\n- Assign a community manager name\n- Deactivate communities you no longer manage\n\nThis information helps you see feedback in context — for example, which communities with upcoming contract renewals might need extra attention."
  },
  {
    id: "critical-alerts",
    title: "Critical Alerts",
    category: "Key Concepts",
    pages: ["rounds/:roundId"],
    tags: ["alert", "warning", "urgent", "critical", "flag", "issue", "dismiss", "resolve"],
    body: "During feedback sessions, if a board member raises something that sounds urgent or serious — like a safety concern, a legal issue, or a major service failure — our system flags it as a **Critical Alert**.\n\nAlerts appear on your round dashboard with a red warning badge. Each alert shows the community name and a brief description of the issue.\n\nYou can take two actions on alerts:\n\n**Dismiss** — If the alert isn't relevant or has already been addressed, dismiss it to remove it from your active list.\n\n**Mark as Resolved** — If you've taken action on the issue, mark it resolved. This keeps a record that you responded to the concern."
  },
  {
    id: "how-invitations-work",
    title: "How Invitations Work",
    category: "Email & Invitations",
    pages: ["rounds", "members"],
    tags: ["invitation", "email", "invite", "send", "link", "board member"],
    body: "When you launch a survey round, every active board member on your list receives a personal email invitation.\n\nThe email comes from ResidentPulse on behalf of your company. It includes a brief explanation of what to expect and a unique link just for that member. They don't need to create an account or log in — clicking the link takes them straight to their feedback session.\n\nThe session starts by asking them to rate your company on a scale of 0 to 10. After that, they'll have a short guided conversation (usually 5-10 minutes) where they can share what's on their mind in their own words."
  },
  {
    id: "automatic-reminders",
    title: "Automatic Reminders",
    category: "Email & Invitations",
    pages: ["rounds", "rounds/:roundId"],
    tags: ["reminder", "follow up", "follow-up", "automatic", "day 10", "day 20", "not responded"],
    body: "Not everyone responds right away — and that's normal. To help improve your response rate, ResidentPulse automatically sends two reminder emails during each round:\n\n**Day 10** — A friendly nudge sent to anyone who hasn't completed their feedback yet.\n\n**Day 20** — A second reminder letting them know time is running out (the round closes at day 30).\n\nReminders are only sent to board members who haven't responded yet. Members who have already completed their session won't receive any follow-up emails.\n\nYou don't need to do anything to trigger these — they're sent automatically."
  },
  {
    id: "bounced-emails",
    title: "Bounced or Undeliverable Emails",
    category: "Email & Invitations",
    pages: ["members"],
    tags: ["bounce", "bounced", "undeliverable", "failed", "spam", "complained", "email error", "delivery"],
    body: "Sometimes an invitation email can't be delivered. This usually happens when an email address has a typo, the inbox is full, or the member's email provider blocks the message.\n\nYou'll see a red **Bounced** badge next to any affected member on the Members page. Bounced members are sorted to the top of the list so they're easy to find.\n\n**To fix a bounced email:** Click on the member, correct their email address, and save. ResidentPulse will automatically resend the invitation to the updated address — you don't need to relaunch the round.\n\nIf a member marked the email as spam, you'll see a **Complained** badge instead. In this case, you may want to reach out to them directly to let them know the email is legitimate."
  },
  {
    id: "member-privacy",
    title: "How Member Feedback Stays Private",
    category: "Privacy & Data",
    pages: ["rounds", "rounds/:roundId", "members"],
    tags: ["privacy", "private", "anonymous", "confidential", "who said what", "conversation", "summary"],
    body: "Board members are more honest when they know their exact words won't be shared. That's why ResidentPulse keeps the actual conversation between the member and our system **private**.\n\nWhat you see instead:\n\n- An **NPS score** (the 0-10 rating) for each response\n- An **AI-generated summary** of the key points from their conversation\n- **Critical Alerts** if any urgent issues were raised\n\nYou'll know what your board members care about and where to focus your attention — without seeing a word-for-word transcript. This approach encourages more candid, useful feedback."
  },
  {
    id: "managing-members",
    title: "Adding and Managing Board Members",
    category: "Managing Your Account",
    pages: ["members"],
    tags: ["add", "member", "board member", "edit", "remove", "delete", "bulk", "import", "list"],
    body: "Go to the **Members** tab to manage your board member list.\n\n**Adding members:** Click \"Add Member\" and enter their first name, last name, email, and community name. You can add them one at a time.\n\n**Editing a member:** Click on any member to update their information. If you correct a bounced email address during an active round, a new invitation is automatically sent.\n\n**Removing a member:** You can deactivate a member so they won't be included in future rounds. If a round is currently in progress, they'll still appear in that round's results if they've already responded.\n\nMake sure your member list is up to date before launching a round — everyone on the active list will receive an invitation."
  },
  {
    id: "reading-results",
    title: "Reading Your Results",
    category: "Managing Your Account",
    pages: ["rounds/:roundId", "trends"],
    tags: ["results", "dashboard", "insights", "summary", "scores", "trends", "word cloud", "analysis"],
    body: "After launching a round, click **View Dashboard** (for active rounds) or **View Results** (for completed rounds) to see your feedback.\n\nYour dashboard includes:\n\n**NPS Score** — Your overall score for this round, with a breakdown of Promoters, Passives, and Detractors.\n\n**Response Rate** — How many board members completed their feedback out of the total invited.\n\n**Summaries** — Each response includes a brief summary of what the board member shared, without revealing their exact words.\n\n**Critical Alerts** — Any urgent issues flagged during conversations, with options to dismiss or mark as resolved.\n\n**AI Insights** — After a round concludes, our system analyzes all responses together and provides themes, patterns, and recommendations.\n\nUse the **Trends** tab to compare scores across multiple rounds and track how sentiment changes over time."
  },
  {
    id: "subscription-limits",
    title: "Your Subscription & Limits",
    category: "Managing Your Account",
    pages: ["account"],
    tags: ["subscription", "plan", "limit", "upgrade", "member limit", "pricing", "free", "paid"],
    body: "Your ResidentPulse plan determines how many board members you can include and how many survey rounds you can run per year.\n\nTo check your current plan and usage, go to the **Account** tab. You'll see your plan name, member limit, and how many members you currently have.\n\nIf you have more board members than your plan allows, you won't be able to launch new rounds until you're within your limit. You can either remove inactive members or upgrade your plan.\n\nPaid plans unlock additional features like quarterly survey cadence (4x per year), the Communities page with contract and manager details, and community-level analytics."
  },
];
```

**Step 2: Verify the file imports cleanly**

Run: `cd /c/Users/mikeh/residentpulse/client && node -e "import('./src/data/helpArticles.js').then(m => console.log(m.helpArticles.length + ' articles, ' + m.CATEGORIES.length + ' categories'))"`

Expected: `15 articles, 5 categories`

**Step 3: Commit**

```bash
git add client/src/data/helpArticles.js
git commit -m "feat: add help article content for contextual help panel"
```

---

### Task 2: Create HelpPanel component

**Files:**
- Create: `client/src/components/HelpPanel.jsx`

**Step 1: Create the HelpPanel component**

This component renders:
1. A floating `?` button (fixed bottom-right, z-40)
2. When clicked, a slide-out panel from the right (z-50) with backdrop
3. Search input that filters articles by title, tags, and body
4. Context-aware suggestions at the top (matching current route)
5. All articles grouped by category below suggestions
6. Accordion-style expansion (one article open at a time)
7. Simple bold text rendering for `**text**` patterns in article body

Key implementation details:
- Uses `useLocation()` to detect current admin route segment
- Route detection: strip `/admin/` prefix, check if path has a sub-ID (→ use `routeKey/:id` pattern), otherwise use the base segment
- Search is case-insensitive, matches against title + tags.join(" ") + body
- Panel closes when clicking backdrop or pressing Escape
- Mobile: panel goes full-width (`w-full sm:w-96`)
- `\n\n` in body text renders as paragraph breaks
- `**text**` in body renders as `<strong>` tags

```jsx
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
  const contextArticles = helpArticles.filter(a =>
    a.pages.some(p => contextPages.includes(p))
  );

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim();
  const filteredArticles = searchLower
    ? helpArticles.filter(a =>
        a.title.toLowerCase().includes(searchLower) ||
        a.tags.some(t => t.includes(searchLower)) ||
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
              return <strong key={j} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
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
          <span className="text-sm font-medium text-gray-900 pr-4">{article.title}</span>
          <svg
            className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
            <p className="text-sm text-gray-500">No articles match your search.</p>
            <p className="text-xs text-gray-400 mt-1">Try different keywords or clear your search to browse all topics.</p>
          </div>
        );
      }
      return <div>{filteredArticles.map(renderArticle)}</div>;
    }

    // Default mode: context suggestions + categories
    return (
      <>
        {/* Context suggestions */}
        {contextArticles.length > 0 && (
          <div className="mb-2">
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Suggested for this page</span>
            </div>
            <div>{contextArticles.map(renderArticle)}</div>
          </div>
        )}

        {/* All articles by category */}
        {CATEGORIES.map(cat => {
          const catArticles = helpArticles.filter(a => a.category === cat);
          if (catArticles.length === 0) return null;
          return (
            <div key={cat} className="mb-2">
              <div className="px-4 py-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{cat}</span>
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <input
                type="text"
                placeholder="Search help articles..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setExpandedId(null); }}
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
```

**Step 2: Commit**

```bash
git add client/src/components/HelpPanel.jsx
git commit -m "feat: add HelpPanel component with search and context-aware suggestions"
```

---

### Task 3: Integrate HelpPanel into AdminPage layout

**Files:**
- Modify: `client/src/pages/AdminPage.jsx`

**Step 1: Add HelpPanel import and render**

At the top of `AdminPage.jsx`, add the import:

```jsx
import HelpPanel from "../components/HelpPanel";
```

Then add `<HelpPanel />` just before the closing `</div>` of the root element (the `min-h-screen` div). It should be a sibling of the header and content area, not nested inside the `max-w-4xl` container (since it uses fixed positioning).

The return statement should end like:

```jsx
      <Outlet context={{ user, isPaidTier }} />
      </div>
      <HelpPanel />
    </div>
  );
```

**Step 2: Verify locally**

Run: `cd /c/Users/mikeh/residentpulse/client && npm run dev`

Manual check:
1. Navigate to any admin page
2. See floating ? button in bottom-right
3. Click it — panel slides in from right
4. See context-aware suggestions for the current page
5. Type in search — articles filter in real time
6. Click an article — it expands accordion-style
7. Click outside panel — it closes
8. Press Escape — panel closes

**Step 3: Commit**

```bash
git add client/src/pages/AdminPage.jsx
git commit -m "feat: integrate HelpPanel into admin layout"
```

---

### Task 4: Final commit and deploy

**Step 1: Verify build succeeds**

Run: `cd /c/Users/mikeh/residentpulse/client && npm run build`

Expected: Build completes with no errors.

**Step 2: Squash into a single feature commit and push**

```bash
git push
```

This triggers Railway auto-deploy.
