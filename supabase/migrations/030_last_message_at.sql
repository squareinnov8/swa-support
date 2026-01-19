-- Add last_message_at to track when actual messages were sent/received
-- This excludes draft creation from "Last Activity" display

ALTER TABLE threads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Initialize last_message_at from the latest non-draft message for each thread
-- This backfills existing threads with accurate timestamps
UPDATE threads t
SET last_message_at = (
  SELECT MAX(m.created_at)
  FROM messages m
  WHERE m.thread_id = t.id
    AND (m.role IS NULL OR m.role != 'draft')
)
WHERE t.last_message_at IS NULL;

-- If no messages exist, fall back to thread created_at
UPDATE threads
SET last_message_at = created_at
WHERE last_message_at IS NULL;

-- Create index for efficient sorting by last message
CREATE INDEX IF NOT EXISTS idx_threads_last_message_at ON threads(last_message_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN threads.last_message_at IS 'Timestamp of last actual message (excludes drafts). Used for inbox sorting.';
