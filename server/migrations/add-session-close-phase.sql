-- ── Programmatic close flow ──────────────────────────────────────────
-- Tracks where each board interview is in the closing wrap-up state
-- machine. The server, not the model, drives the close — V3.0 prompt
-- engineering plateaued (both Grok and Claude consistently violate
-- the "Thank you for your time, I'm concluding this chat" rule).
--
-- States:
--   'interview'                    — normal Q&A, model in control
--   'awaiting_playback_response'   — server emitted the playback,
--                                    waiting for resident to answer
--                                    "Anything missing from that…?"
--   'done'                         — final close emitted, [CHAT:END]
--                                    sent, session is wrapped
--
-- Transitions (in chat.js):
--   interview → awaiting_playback_response
--     when (a) AI message count ≥ PLAYBACK_TURN_THRESHOLD, OR
--     (b) the user's message contains terminal language ("that's all",
--     "no more", etc.) AND AI count ≥ MIN_TURNS_BEFORE_TERMINAL_CLOSE
--
--   awaiting_playback_response → done
--     on the next user message (whatever they answer to the playback,
--     server emits the templated final close)
--
-- Default 'interview' for back-compat with existing rows.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS close_phase TEXT NOT NULL DEFAULT 'interview';

-- Index isn't necessary here — close_phase is read on every chat
-- reply for one session at a time, never queried in aggregate.
