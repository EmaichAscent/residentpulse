-- Per-round response window (in days). Default 21 — gives a clean
-- weekly cadence: Day 1 launch · Day 8 first reminder · Day 15 second
-- reminder · Day 22 closes. Tighter than the legacy 30-day window
-- (which had reminders at days 10 and 20 then closed at day 30).
--
-- Configurable by the admin via the Configure / Schedule round modal on
-- /admin/rounds. Used by:
--   - surveyRounds.js POST /:id/launch — sets closes_at = launched_at + window_days
--   - scheduler.js sendReminders()      — sends resident follow-ups at
--                                         floor(window/3) and floor(2*window/3)
--                                         of launched_at (for a 21-day
--                                         window: days 7 and 14 elapsed →
--                                         calendar Day 8 and Day 15).
--
-- Bounds enforced at the API layer (7..60). Allowing wider here is fine —
-- the constraint is product policy, not data integrity.

ALTER TABLE survey_rounds
  ADD COLUMN IF NOT EXISTS window_days INTEGER NOT NULL DEFAULT 21;
