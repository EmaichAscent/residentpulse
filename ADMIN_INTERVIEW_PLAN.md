# Admin Induction Interview Feature Plan

## Overview
AI-powered interview for client admins to capture company context, concerns, and goals.
Generates a client-specific prompt supplement appended to the core system prompt when interviewing board members.

## Requirements Gathering

### Q1: Interview format — conversational AI chat or structured form?
**Answer:** Hybrid — start with a few fixed fields (company size, years in business, etc.) then conversational AI for open-ended topics (concerns, goals, competitive advantages).

### Q2: Where does the admin see this — dedicated page after first login, modal on dashboard, or separate route?
**Answer:** Dedicated page (e.g., /admin/onboarding) — full-screen interview shown after first login, before they see the dashboard.

### Q3: Is the interview mandatory before launching the first survey round, or just encouraged?
**Answer:** Strongly encouraged — show the interview page on first login but allow them to skip with a "Do this later" link. Remind them again before launch.

### Q4: How many questions deep should the AI go?
**Answer:** 5-8 questions, with follow-ups where more info is truly needed for best results. Be focused on collecting essentials and move to wrap up. Admin can end early if they choose; otherwise AI concludes when satisfied.

### Q5: For re-interviews before subsequent rounds — block the Launch button or show a dismissable prompt?
**Answer:** Pre-launch prompt — when they click Launch, show a dialog: "It's been X months since your last check-in. Would you like to update your profile before launching?" with Skip/Start options.

### Q6: Should re-interviews be shorter/focused ("what's changed?") or full re-interview?
**Answer:** Focused on changes — revisit company size, number of communities managed, any material changes (software switching, staff turnover, elevated customer churn), feedback on prior round of board engagement, and desired outcomes for this round.

### Q7: If the admin dismisses the re-interview, reuse the last version of the generated prompt?
**Answer:** Yes, reuse last prompt. Simple and non-blocking.

### Q8: Should superadmin be able to edit the generated prompt before it goes live, or fully automatic?
**Answer:** Fully automatic — AI generates prompt and it's immediately active. Superadmin can view it but no approval step needed.

### Q9: Should the client admin ever see the generated prompt? (Confirming: hidden from them)
**Answer:** Show a summary at the end of the interview chat and ask the user "does this sound right?" Once confirmed, it's not visible in the UI. Tell the admin that the AI is storing this to do a better job. Do NOT let them manually edit it.

### Q10: SuperAdmin UI — just the generated prompt per client, or also full interview transcript? Both with version history?
**Answer:** All three — the active generated prompt, full interview transcript, and version history for all past interviews.

### Q11: For re-interviews, should the AI have access to the previous interview transcript?
**Answer:** Yes, full context — AI sees the previous transcript and generated prompt. Can reference what admin said last time for smarter follow-ups.

### Q12: Same model (Sonnet) as board member surveys, or different?
**Answer:** Same — Sonnet 4.5. Consistent quality, already integrated.

---

## SuperAdmin Redesign

### Current State
- Two tabs: Clients (table with search) and Prompt Editor
- Client table columns: Company Name, Address, Plan, Status, Admins, Created, Actions (Impersonate/Edit/Deactivate)
- Edit opens a modal to modify company info + subscription plan
- No client detail/drill-down view

### Q13: Client list → detail page — should clicking a client row open a dedicated detail page, or expand inline?
**Answer:** Dedicated detail page (e.g., /superadmin/clients/3). Full page with tabs/sections. More extensible.

### Q14: What sections should the client detail view have?
**Answer:**
- Overview card: company info, status, subscription plan, member count, community count, created date
- Interview & Prompt: active AI prompt, transcript, version history
- Survey Rounds: all rounds with status, dates, response counts
- Admin Users: all admins for this client with last login timestamps
- Activity/Engagement: last login, last file upload or record edits. Warning indicator if extended period of non-engagement (no logins).

### Q15: Should Edit remain a modal or move into the detail view as an inline editable section?
**Answer:** Inline on the detail page — fields are directly editable with a Save button. No modal needed.

### Q16: Should the client list table stay as-is (with key stats) or become simpler (just name/status) since detail lives on its own page?
**Answer:** Simplify to essentials — company name, plan, status, last activity date. Click row to see everything else.

### Q17: Should the Prompt Editor tab stay separate, or move into each client's detail view?
**Answer:** Move to a "Settings" tab — rename Prompt Editor tab to Settings. Includes base prompt editor plus any future global settings. More extensible.

### Q18: Any other data or actions you want in the SuperAdmin UI that don't exist today?
**Answer:**
- Dashboard/overview page: aggregate stats (total clients, active rounds, total responses, engagement warnings). Quick health check landing page.
- Activity log: global audit trail — who logged in, who launched rounds, who signed up. Useful for monitoring.
