# Pre-Survey Intro Email Feature Spec

**Date:** 2026-03-11
**Status:** Approved for development
**Project:** #4 — Pre-Survey Launch Email

## Problem

When a survey round launches, board members receive the survey invitation cold — no context on what ResidentPulse is, why they're being asked, or what to expect. CAM Ascent currently sends a Vimeo intro video (https://vimeo.com/1144965624) manually to set expectations, but this is outside the system and easy to forget.

## Solution

Add an optional per-round toggle that sends a co-branded intro email — containing the video and expectation-setting copy — before the survey invitation. When enabled, the intro goes out on launch day and the actual survey invitation auto-sends 3 days later via the existing scheduler.

## Design Decisions

- **Per-round toggle, default OFF.** First-time clients may want it; repeat clients may skip it. Not a global account setting.
- **Approach: Delay-based (Approach A).** Admin clicks one button. Intro sends immediately, scheduler auto-sends invitations 3 days later. No second manual step required.
- **30-day window preserved.** The collection window compresses slightly (27 days of active surveying) but the 30-day close date is unchanged.
- **Single global video.** Hardcoded Vimeo URL (or env var). No per-client video customization planned.
- **Co-branded email.** Client logo + management company name + "Powered by CAM Ascent" footer. Same branding treatment as existing invitation emails.

## Round Lifecycle

### With Intro Email (toggle ON)

| Day | Action | Round Status |
|-----|--------|--------------|
| 1 | Admin clicks Launch -> intro emails sent to all active members | `intro_sent` |
| 4 | Scheduler auto-sends survey invitations | `in_progress` |
| 10 | Scheduler sends reminder 1 to non-respondents | `in_progress` |
| 20 | Scheduler sends reminder 2 to non-respondents | `in_progress` |
| 30 | Scheduler auto-closes round | `concluded` |

### Without Intro Email (toggle OFF, current behavior)

| Day | Action | Round Status |
|-----|--------|--------------|
| 1 | Admin clicks Launch -> survey invitations sent | `in_progress` |
| 10 | Scheduler sends reminder 1 to non-respondents | `in_progress` |
| 20 | Scheduler sends reminder 2 to non-respondents | `in_progress` |
| 30 | Scheduler auto-closes round | `concluded` |

## Database Changes

### Migration: `add-intro-email.sql`

Add two columns and update the status CHECK constraint:

```sql
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS include_intro_email BOOLEAN DEFAULT FALSE;
ALTER TABLE survey_rounds ADD COLUMN IF NOT EXISTS intro_sent_at TIMESTAMP;

-- Add 'intro_sent' to the allowed status values
ALTER TABLE survey_rounds DROP CONSTRAINT IF EXISTS survey_rounds_status_check;
ALTER TABLE survey_rounds ADD CONSTRAINT survey_rounds_status_check
  CHECK(status IN ('planned', 'intro_sent', 'in_progress', 'concluded'));
```

- `include_intro_email` — per-round toggle, set by admin before launch
- `intro_sent_at` — timestamp when intro emails were sent; scheduler uses this to determine when to auto-send invitations (`intro_sent_at + 3 days`)
- Status constraint updated to allow the new `intro_sent` value

No new tables required.

## Server Changes

### Launch Endpoint (`POST /api/admin/survey-rounds/:id/launch`)

Modified flow based on `include_intro_email`:

**If `include_intro_email = true`:**
1. Validate round (same checks as today: planned status, no other active round, active members exist, within plan limits)
   - **Important:** The active-round check must include BOTH statuses: `status IN ('in_progress', 'intro_sent')`
2. Update round: `status = 'intro_sent'`, `intro_sent_at = NOW()`, `closes_at = NOW() + 30 days`, `members_invited = count`
   - Note: `closes_at` is set NOW (day 1) to preserve the 30-day window. Do NOT recalculate on day 4.
   - Do NOT set `launched_at` yet — that happens when survey invitations go out on day 4
3. Create email job for intro emails (reuses `email_jobs` table for progress tracking)
4. Background task `processIntroEmailJob()` sends intro email to all active members
   - Similar to `processEmailJob` but: uses `buildIntroEmail()` template, does NOT generate invitation tokens, does NOT create `invitation_logs`
   - Updates `email_jobs` progress so client can poll
   - On completion: does NOT send admin launch notification (that happens on day 4)
5. Return job_id to client for progress polling

**If `include_intro_email = false`:**
- Current behavior unchanged

### Toggle Endpoint (`PUT /api/admin/survey-rounds/:id/intro-email`)

New endpoint to toggle the intro email setting on a planned round:

```
PUT /api/admin/survey-rounds/:id/intro-email
Body: { "enabled": true/false }
```

- Only allowed when round status is `planned`
- Returns updated round data

### Scheduler (`server/scheduler.js`)

Add new function `sendScheduledInvitations()` to the daily 9 AM cron:

```
Find rounds WHERE status = 'intro_sent'
  AND intro_sent_at <= NOW() - INTERVAL '3 days'
```

For each matching round:
1. Re-query active members at this point (member list may have changed since day 1)
2. Update `members_invited` to the current active member count
3. Send survey invitations using the full invitation flow: generate tokens, send emails via `buildInvitationEmail()`, create `invitation_logs`, track in `email_jobs`
   - `sent_by` in `invitation_logs` is NULL (system-initiated, not admin-initiated)
4. Update round: `status = 'in_progress'`, `launched_at = NOW()`
   - Do NOT recalculate `closes_at` — it was already set on day 1
5. Send `notifyRoundLaunched()` to client admins
6. The existing reminder logic (day 10, day 20 from `launched_at`) then works automatically

**Note on queries filtering by status:** The trends/analytics query (`status IN ('in_progress', 'concluded')`) correctly excludes `intro_sent` rounds since they have no survey data yet.

### Email Template (`buildIntroEmail()` in emailService.js)

New template function. Structure:

- **Header:** Client logo (if available) + ResidentPulse banner
- **Greeting:** "Dear [First Name],"
- **Body:** Brief, professional copy:
  - Your management company [Company Name] has partnered with ResidentPulse to gather feedback
  - In a few days you'll receive a short survey invitation
  - It's a quick AI-powered conversation (5-10 minutes)
  - Your feedback directly helps improve your community
- **Video:** Embedded Vimeo link/thumbnail — "Watch this brief introduction" CTA
- **Footer:** "Powered by CAM Ascent" + ResidentPulse branding
- **No survey link** — this is informational only

Video URL: `process.env.INTRO_VIDEO_URL || "https://vimeo.com/1144965624"`

## Client Changes

### SurveySchedule.jsx

On planned round cards (before launch):
- **Toggle:** "Include intro email" — checkbox or switch, default OFF
- **Tooltip:** "Send a brief introductory email with a video overview 3 days before the survey invitation. Recommended for first-time surveys."
- Calls `PUT /api/admin/survey-rounds/:id/intro-email` on toggle

When round is in `intro_sent` status:
- Status badge: "Intro Sent" (distinct color from "In Progress")
- Informational text: "Survey invitations will be sent automatically on [intro_sent_at + 3 days]"
- Progress indicator if intro email job is still sending

### Help Articles

New article in `client/src/data/helpArticles.js`:
- **"Pre-Survey Intro Email"** — explains the feature, when to use it, what recipients see, the 3-day delay, and that it's optional per round

## Email Data Requirements

The intro email needs the same data as the invitation email:
- `user.first_name`, `user.email`
- `user.community_name`, `user.management_company`
- `roundInfo.companyName`, `roundInfo.clientId`, `roundInfo.logoUrl`
- Video URL (global constant/env var)

No survey token is generated for the intro email — tokens are only created when the actual invitation goes out on day 4.

## Edge Cases

1. **Admin disables intro after launch:** Not allowed — toggle only works on `planned` rounds.
2. **Round with intro_sent and no members respond to intro:** No action needed — the intro is informational. Scheduler sends invitations on day 4 regardless.
3. **Scheduler downtime on day 4:** Scheduler uses `<=` comparison, so it catches up on the next run. Invitations go out on the next 9 AM after the 3-day threshold.
4. **Checking "no other active round":** The active-round blocking query in the launch endpoint must check `status IN ('in_progress', 'intro_sent')`. Audit all queries that filter on round status to ensure `intro_sent` is handled appropriately.
5. **Close date calculation:** `closes_at` is set on day 1 (admin click), not day 4. The scheduler must NOT recalculate it when sending invitations.
6. **Member list changes between day 1 and day 4:** The scheduler re-queries active members on day 4. Some members may have been added or deactivated since the intro was sent. `members_invited` is updated to reflect the actual invitation count. This means some members may get the survey without the intro — acceptable.
7. **No cancel mechanism (v1):** Once launched with intro, the round cannot be cancelled or rolled back. Acceptable for v1; admin should be confident before launching.

## Testing Plan

- Toggle on/off on a planned round, verify DB state
- Launch with intro enabled: verify intro emails sent, status = `intro_sent`
- Verify scheduler picks up round after 3 days and sends invitations
- Verify reminders still fire at day 10/20 from `launched_at`
- Launch without intro: verify current behavior unchanged
- Verify `intro_sent` blocks launching another round
- Verify toggle disabled on non-planned rounds
