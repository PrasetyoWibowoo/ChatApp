-- Add edited_at column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

-- Create index for edited messages
CREATE INDEX IF NOT EXISTS idx_messages_edited_at ON messages(edited_at) WHERE edited_at IS NOT NULL;
