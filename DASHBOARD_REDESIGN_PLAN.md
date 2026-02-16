# Dashboard Redesign Requirements

## Overview
Redesign the client admin dashboard around survey rounds as the primary organizational unit. Each round gets its own dashboard with live data during collection and AI-generated insights after close. Add cross-round trend analysis, critical alert detection, and community-level NPS cohort tracking.

---

## 1. Admin Landing Page — Rounds + Trends Tabs

### Rounds Tab (default)
The admin's operational home. Shows all survey rounds organized by status.

**Critical Alerts Banner** (top of page, above rounds)
- Persistent amber/red warning cards for time-sensitive issues flagged during active rounds
- Example: "1 board member discussed replacing your company — Round 3, Sunset Villas"
- Links to the specific respondent summary within the round dashboard
- Dismissable — admin clicks to acknowledge, alert clears from the banner
- Only appears when there are unacknowledged alerts; zero noise otherwise
- Detection threshold is HIGH — explicit intent to terminate contract, threats of legal action, safety concerns. NOT general complaints or frustration.

**Round Cards**
- Active rounds: prominent card with progress bar, response count, days remaining, "View Dashboard" and "Close Early" actions
- Completed rounds: card showing NPS score, response rate, date range, "View Results" link
- Upcoming/scheduled rounds: card with scheduled date, "Edit" option

### Trends Tab
Only meaningful after 2+ completed rounds. Shows empty state with explanation before that.

**Charts:**
- **NPS Score Over Time** — line chart plotting headline NPS for each completed round
- **Response Rate Over Time** — participation trend across rounds
- **Community Cohort Stacked Bar** — per round, how many communities are Promoter / Passive / Detractor (stacked bar chart)
- **Word Cloud Comparison** — side-by-side word clouds from recent rounds showing how conversation topics shift

---

## 2. Round Dashboard (drill into a specific round)

### While Round is Active (in progress)
- Response rate progress bar — X of Y board members responded
- Who has / hasn't responded (list for nudging)
- NPS scores updating live as responses arrive
- Community cohort chart (Promoter/Passive/Detractor communities) — updating live
- Word cloud building in real time
- Critical alerts section (if any flagged)
- Individual respondent summaries appearing as each person completes their interview (AI-generated, not raw transcripts)
- **No AI Insights section yet** — reserved for round close
- "Close Round Early" button

### After Round Closes (completed)
Everything from the active view, plus:

**AI Insights Section** (generated automatically on close)
- **Key Findings** — brief narrative summary of what the data revealed
- **Recommended Actions** — specific, prioritized action items the admin should consider implementing
- **Where CAM Ascent Can Help** — soft callout for items where professional consulting adds value (e.g., "Our team can help you design a board communication framework — reach out to your account manager")

**Individual Respondent Cards**
- AI-generated summary per board member: NPS score, key concerns, sentiment
- Full transcripts stored but NOT exposed in UI (future toggle capability)

---

## 3. AI Insights Generation

### Trigger
- Automatic when a round closes (either at deadline or admin-triggered early close)
- No manual "Generate" button — insights are waiting when the admin next logs in

### Consensus Mechanism
- Run the analysis 3 times independently against all round transcripts
- Final synthesis pass compares the 3 outputs and produces a single authoritative result
- Eliminates single-pass LLM randomness; produces consistent, trustworthy output

### Output Structure
Stored in database, displayed in the round dashboard:
1. **Key Findings** — narrative summary
2. **Recommended Actions** — prioritized list of actionable items
3. **CAM Ascent Callouts** — items where consulting engagement would help

### Input
- All completed interview transcripts from the round
- Client company context (from admin onboarding interview)
- Previous round insights (if available, for continuity)

---

## 4. Critical Alert System

### Detection
- **Real-time during board member interview** — the AI flags the message immediately as critical when it detects it
- Stored as a flag on the specific message/session
- High threshold: explicit intent to terminate management contract, threats of legal action, safety/emergency concerns
- NOT triggered by: general complaints, frustration, low NPS scores, venting

### Display
- Alert banner on admin landing page (above rounds)
- Also visible within the specific round's dashboard
- Each alert shows: board member name, community, brief description of the concern, link to respondent summary

### Dismissal
- Admin can acknowledge/dismiss individual alerts
- Dismissed alerts no longer appear in the banner
- Dismissal logged (who dismissed, when) for audit trail

---

## 5. Community NPS Cohort Classification

### Method
- For each community in a round, take the **median NPS** of all responding board members from that community
- Classify based on standard NPS bands:
  - Promoter: 9-10
  - Passive: 7-8
  - Detractor: 0-6

### Display
- **Round Dashboard**: horizontal bar or donut showing community count in each cohort, with community names listed under each
- **Trends Tab**: stacked bar chart over time showing cohort counts shifting across rounds

---

## 6. Word Cloud

### Round Dashboard
- Generated from board member responses in that round
- Updates live as responses come in during active rounds
- Highlights frequently mentioned topics/themes

### Trends Tab
- Side-by-side comparison of word clouds from multiple rounds
- Shows how conversation topics evolve over time

---

## 7. Round Lifecycle

### States
- **Scheduled** — created with a future launch date
- **Active** — launched, accepting responses, dashboard shows live data
- **Closed** — either auto-closed at deadline or manually closed early by admin
- **Analyzed** — insights generated (transitions automatically after close)

### Closing
- **Auto-close**: system closes the round when `closes_at` timestamp arrives
- **Manual close**: admin can click "Close Round Early" at any time during active round
- Either trigger initiates the AI insights generation pipeline

---

## 8. Data Architecture Notes

### Per-respondent summaries
- Generated by AI after each board member completes their interview
- Stored in database
- Shown to admin in real-time as responses arrive
- Full transcripts retained but hidden from admin UI (future feature toggle)

### Insights storage
- Generated insights stored per round
- Include the 3 independent analysis passes + final synthesis
- Supports regeneration if needed

### Critical alerts
- Flag stored on message/session level
- Links to round and respondent
- Dismissal state tracked per admin

---

## Future Features (stub for later discussion)
- **Admin email notifications** — digest/update emails to admin(s) as responses come in during active rounds
- **Full transcript toggle** — option to expose raw board member transcripts to admin
- **Theme tracking across rounds** — AI-tagged themes compared over time (beyond word clouds)
- **PDF/export** — downloadable round reports for board presentations
