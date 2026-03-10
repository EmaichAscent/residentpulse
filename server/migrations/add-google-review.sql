-- Add google_review_response to sessions (tracks whether promoter accepted review request)
-- Values: 'yes', 'no', or NULL (not asked / not a promoter)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS google_review_response TEXT;
