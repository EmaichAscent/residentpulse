# Help Panel Design

## Overview

A contextual help system for ResidentPulse admins. A floating ? button in the bottom-right opens a slide-out panel with search and context-aware article suggestions. Written for non-technical users with no AI experience.

## Approach

Static JSON articles with a client-side HelpPanel component. All content lives in a single JS data file. No backend, no new dependencies, deploys with the app.

## Article Data Structure

Each article in `client/src/data/helpArticles.js`:

```js
{
  id: "what-is-nps",
  title: "What is an NPS Score?",
  category: "Key Concepts",
  pages: ["rounds", "rounds/:roundId", "trends"],
  tags: ["nps", "score", "promoter", "detractor", "passive"],
  body: "Your NPS (Net Promoter Score) measures how likely..."
}
```

- `pages` maps articles to routes for context-aware suggestions
- `tags` supplements search matching beyond title and body
- `body` uses simple text with `**bold**` markers (no markdown renderer)

## Categories and Articles

### Getting Started
1. **Welcome to ResidentPulse** - What the platform does, core value proposition
2. **Setting Up Your Account** - The 3 setup steps: business interview, add members, schedule first round
3. **Launching Your First Round** - What happens when you click Confirm & Launch

### Key Concepts
4. **What is an NPS Score?** - The 0-10 scale, Promoters/Passives/Detractors, why it matters
5. **Understanding Survey Rounds** - What a round is, the 30-day window, statuses (Planned/In Progress/Concluded)
6. **Survey Cadence** - 2x/year vs 4x/year, how changing it affects schedule
7. **Communities** - Auto-created from members, manual management, contract details (paid plans)
8. **Critical Alerts** - What triggers them, how to dismiss or mark resolved

### Email & Invitations
9. **How Invitations Work** - Personal email with unique link, NPS score then guided conversation
10. **Automatic Reminders** - Day 10 and day 20 reminders to non-responders only
11. **Bounced or Undeliverable Emails** - Bounce status on Members page, correcting email auto-resends

### Privacy & Data
12. **How Member Feedback Stays Private** - Raw conversations private, admin sees AI summary and flagged issues

### Managing Your Account
13. **Adding and Managing Board Members** - Add individually or bulk, editing, removing mid-round
14. **Reading Your Results** - Dashboard: NPS, response rates, summaries, trends, AI insights
15. **Your Subscription & Limits** - Member limits, plan tiers, usage

## Component: HelpPanel

### Floating Button
- Fixed position: bottom-right (`fixed bottom-6 right-6 z-40`)
- `?` icon, `var(--cam-blue)` background, white text, subtle shadow
- Click toggles panel open/closed

### Slide-out Panel
- Fixed right side: `fixed top-0 right-0 h-full w-full sm:w-96 z-50`
- Semi-transparent backdrop, clicking outside closes panel
- Header with "Help" title and X close button
- Search input field below header

### Content Display
- **When search is empty**: Context suggestions (2-4 articles matching current page) at top, then all articles grouped by category
- **When searching**: Filtered results replace category groupings, match against title + tags + body
- **Article expansion**: Accordion-style, one article open at a time

### Context Mapping
Uses `useLocation()` to read current route path. Extracts route segment and matches against article `pages` arrays:
- `/admin/rounds` -> articles with `"rounds"` in pages
- `/admin/rounds/123` -> articles with `"rounds/:roundId"` in pages
- `/admin/members` -> articles with `"members"` in pages
- `/admin/trends` -> articles with `"trends"` in pages
- `/admin/communities` -> articles with `"communities"` in pages
- `/admin/account` -> articles with `"account"` in pages

## Integration

- `HelpPanel` added to `AdminPage.jsx` (shared admin layout), available on all admin pages
- State is local to HelpPanel: `isOpen`, `searchQuery`, `expandedArticleId`
- No context providers or global state needed
- Z-index: button z-40 (below modals), panel z-50 (same as modals)
- Mobile: full-width panel on small screens

## Content Guidelines

All articles written for non-technical users:
- No jargon (say "guided conversation" not "AI-powered interview")
- No technical terms (say "our system" not "the AI model")
- Short paragraphs, 2-3 sentences each
- Use bold for key terms on first mention
- Action-oriented: tell them what to do, not how it works internally
