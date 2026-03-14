# ResidentPulse — Test Mode (Sandbox) Feature

## The Problem

New clients signing up want to experience the full survey workflow internally before sending it to real board members. They need a safe space to test with coworkers, see what the AI chat feels like, review the analytics — and then go live with confidence that none of that test data pollutes their real results.

## The Solution

A "Test Mode / Live Mode" toggle in the admin dashboard that gives every client two completely separate environments sharing the same account.

## How It Works

- Test mode has its own communities, members, survey round, sessions, and analytics — completely isolated from live data
- A single test survey round is auto-created when they enter test mode
- Capped at 25 test members (enough to try it out, not enough to abuse as a free workaround)
- The full experience works — AI chat, summaries, NPS scores, insights, critical alerts — so they're previewing exactly what production looks like
- A clear visual banner indicates when they're in test mode so there's no confusion
- Available as an optional onboarding step ("Try a test run before going live") but accessible anytime — even after they've gone live, they can switch back to test mode to demo or experiment

## Going Live

First time they switch to live mode, a guided confirmation explains that test data stays in test mode and they're starting fresh. After that, switching between modes is seamless.

## Feature Flag

Controlled by a single environment variable: `FEATURE_TEST_MODE=true|false`

When `false` (or absent):
- Test mode toggle does not render in the UI
- Mode endpoints return 404
- All queries default to `is_test = FALSE` (live mode only)
- Onboarding "Try a test run" step is hidden
- Database columns remain (harmless, default `FALSE`) — zero migration needed to disable

When `true`:
- Full test mode experience is available

This allows the feature to be turned off with a single env var change, no code deployment needed. To remove entirely later, delete the flag checks and test-mode-specific code — the columns stay inert with their defaults.

## Scope

This touches the data model, most server queries, the admin UI navigation, the onboarding flow, and help articles. It's a significant but well-defined build.
