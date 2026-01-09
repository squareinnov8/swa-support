-- Add summary field to threads for CRM syndication
-- Short sentence summarizing issue and latest status

ALTER TABLE threads ADD COLUMN IF NOT EXISTS summary TEXT;

-- Index for potential CRM sync queries
CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC);

COMMENT ON COLUMN threads.summary IS 'Short summary of issue and status for CRM syndication';
