-- Migration: CRM Integration (EngageBay)
-- Adds columns to track CRM sync status on threads

-- Add CRM tracking columns to threads
ALTER TABLE threads
ADD COLUMN IF NOT EXISTS crm_contact_id text,
ADD COLUMN IF NOT EXISTS crm_synced_at timestamptz;

-- Create index for finding unsynced threads
CREATE INDEX IF NOT EXISTS idx_threads_crm_sync
ON threads(crm_synced_at)
WHERE crm_contact_id IS NULL;

-- Create table to track CRM sync history
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES threads(id) ON DELETE CASCADE,
  email text NOT NULL,
  engagebay_contact_id text,
  sync_type text NOT NULL, -- 'interaction', 'resolved', 'bulk'
  success boolean NOT NULL DEFAULT true,
  error_message text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_thread ON crm_sync_log(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_email ON crm_sync_log(email);

-- Comment on purpose
COMMENT ON TABLE crm_sync_log IS 'Tracks CRM sync operations for support threads';
COMMENT ON COLUMN threads.crm_contact_id IS 'EngageBay contact ID for this thread';
COMMENT ON COLUMN threads.crm_synced_at IS 'When this thread was last synced to CRM';
