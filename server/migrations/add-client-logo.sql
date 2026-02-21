-- Client logo storage (base64-encoded, max ~500KB)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_mime_type TEXT;
