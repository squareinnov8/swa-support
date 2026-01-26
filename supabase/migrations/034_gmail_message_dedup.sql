-- Migration: Add unique constraint on gmail_message_id to prevent duplicate message inserts
-- This fixes a race condition where concurrent webhook calls can insert the same message multiple times

-- First, create an index on the gmail_message_id JSONB field for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_gmail_message_id
ON messages ((channel_metadata->>'gmail_message_id'));

-- Create a unique partial index on gmail_message_id (only for messages that have one)
-- This prevents duplicate inserts while allowing messages without gmail_message_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_gmail_message_id_unique
ON messages ((channel_metadata->>'gmail_message_id'))
WHERE channel_metadata->>'gmail_message_id' IS NOT NULL;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_messages_gmail_message_id_unique IS
'Prevents duplicate message inserts from concurrent webhook calls. Each Gmail message ID can only appear once.';
