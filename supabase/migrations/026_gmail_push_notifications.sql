-- Gmail Push Notifications
-- Adds columns to track Gmail watch subscription for real-time notifications

-- Add watch-related columns to gmail_sync_state
ALTER TABLE gmail_sync_state
ADD COLUMN IF NOT EXISTS watch_expiration timestamptz,
ADD COLUMN IF NOT EXISTS watch_resource_id text,
ADD COLUMN IF NOT EXISTS pubsub_topic text;

-- Index for finding expired watches
CREATE INDEX IF NOT EXISTS idx_gmail_sync_watch_expiration
ON gmail_sync_state(watch_expiration)
WHERE sync_enabled = true;

-- Comment for documentation
COMMENT ON COLUMN gmail_sync_state.watch_expiration IS 'When the Gmail push notification watch expires (max 7 days from creation)';
COMMENT ON COLUMN gmail_sync_state.watch_resource_id IS 'Resource ID returned by Gmail watch() for stopping the watch';
COMMENT ON COLUMN gmail_sync_state.pubsub_topic IS 'Google Cloud Pub/Sub topic for push notifications';
