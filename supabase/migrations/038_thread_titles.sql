-- Add title column to threads for brief, scannable thread summaries
-- Subject is kept for email threading; title is for display in inbox

ALTER TABLE threads
ADD COLUMN IF NOT EXISTS title TEXT;

-- Index for potential future searches on title
CREATE INDEX IF NOT EXISTS idx_threads_title ON threads(title) WHERE title IS NOT NULL;

COMMENT ON COLUMN threads.title IS 'Brief display title (3-6 words) generated from thread content, e.g. "prospect: military discount, jeep compatibility"';
