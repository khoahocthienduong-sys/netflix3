-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  imap_email VARCHAR(255) NOT NULL,
  imap_password TEXT NOT NULL,
  imap_host VARCHAR(255) NOT NULL,
  imap_port INTEGER DEFAULT 993,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create codes table to store fetched Netflix codes
CREATE TABLE IF NOT EXISTS codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  household_link TEXT,
  email_subject TEXT,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_codes_user_id ON codes(user_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo purposes)
-- In production, you should implement proper authentication
CREATE POLICY "Allow public read on users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON users FOR UPDATE USING (true);

CREATE POLICY "Allow public read on codes" ON codes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codes" ON codes FOR INSERT WITH CHECK (true);
