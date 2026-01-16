-- Fix message and thread timestamps to use actual email dates from headers
-- instead of system ingestion time

-- Step 1: Update messages.created_at from channel_metadata->gmail_date
UPDATE messages
SET created_at = (channel_metadata->>'gmail_date')::timestamptz
WHERE channel_metadata->>'gmail_date' IS NOT NULL
  AND channel_metadata->>'gmail_date' != ''
  AND channel = 'email';

-- Step 2: Update threads.created_at to match their earliest message
UPDATE threads t
SET created_at = earliest.min_created
FROM (
  SELECT thread_id, MIN(created_at) as min_created
  FROM messages
  GROUP BY thread_id
) earliest
WHERE t.id = earliest.thread_id
  AND earliest.min_created < t.created_at;

-- Step 3: Update threads.updated_at to match their latest message
UPDATE threads t
SET updated_at = latest.max_created
FROM (
  SELECT thread_id, MAX(created_at) as max_created
  FROM messages
  GROUP BY thread_id
) latest
WHERE t.id = latest.thread_id;

-- Log the fix
DO $$
DECLARE
  msg_count integer;
  thread_count integer;
BEGIN
  SELECT COUNT(*) INTO msg_count FROM messages WHERE channel_metadata->>'gmail_date' IS NOT NULL;
  SELECT COUNT(*) INTO thread_count FROM threads;
  RAISE NOTICE 'Fixed timestamps for % messages across % threads', msg_count, thread_count;
END $$;
