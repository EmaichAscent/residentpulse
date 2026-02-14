-- Add email invitation columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invitation_token_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_invited_at TIMESTAMP;

-- Create index on invitation_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_invitation_token ON users(invitation_token);

-- Create invitation_logs table for tracking who sent invitations
CREATE TABLE IF NOT EXISTS invitation_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_by INTEGER REFERENCES client_admins(id) ON DELETE SET NULL,
  email_status TEXT DEFAULT 'sent' CHECK(email_status IN ('sent', 'failed')),
  error_message TEXT
);

-- Create indexes on invitation_logs for faster queries
CREATE INDEX IF NOT EXISTS idx_invitation_logs_user_id ON invitation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_logs_client_id ON invitation_logs(client_id);
