-- Add channel support to threads and messages
-- Enables multi-channel ingestion (email, web_form, chat, voice, etc.)

-- Add channel to threads (primary channel for the thread)
ALTER TABLE threads ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';

-- Add channel to messages (each message can come from different channel)
ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';

-- Add channel_metadata for storing channel-specific data
ALTER TABLE messages ADD COLUMN channel_metadata JSONB;

-- Create index for filtering by channel
CREATE INDEX idx_threads_channel ON threads(channel);
CREATE INDEX idx_messages_channel ON messages(channel);

-- Add comment for documentation
COMMENT ON COLUMN threads.channel IS 'Primary channel: email, web_form, chat, voice';
COMMENT ON COLUMN messages.channel IS 'Channel this message came from: email, web_form, chat, voice';
COMMENT ON COLUMN messages.channel_metadata IS 'Channel-specific metadata (e.g., email headers, chat session info)';
