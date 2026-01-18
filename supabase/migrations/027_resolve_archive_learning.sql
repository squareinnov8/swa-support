-- Migration: 027_resolve_archive_learning.sql
-- Adds archive support for threads and confidence-based learning extraction

-- ============================================
-- 1. Archive Support for Threads
-- ============================================

-- Add archive columns to threads table
ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS archived_by TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS learning_extracted BOOLEAN DEFAULT FALSE;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS learning_extracted_at TIMESTAMPTZ;

-- Index for fast inbox filtering (hide archived by default)
CREATE INDEX IF NOT EXISTS idx_threads_not_archived ON threads(is_archived) WHERE is_archived = FALSE;

-- Index for threads needing learning extraction
CREATE INDEX IF NOT EXISTS idx_threads_learning_pending ON threads(state, learning_extracted)
  WHERE state = 'RESOLVED' AND learning_extracted = FALSE;

-- ============================================
-- 2. Extend Learning Proposals
-- ============================================

-- Add confidence scoring columns to learning_proposals
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2);
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'observation';
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS similarity_to_existing NUMERIC(3,2);
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS similar_doc_id UUID REFERENCES kb_docs(id);

-- Index for finding pending proposals
CREATE INDEX IF NOT EXISTS idx_learning_proposals_pending ON learning_proposals(status) WHERE status = 'pending';

-- ============================================
-- 3. Resolution Analyses Table
-- ============================================

-- Track learning extraction from resolved threads
CREATE TABLE IF NOT EXISTS resolution_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES threads(id) ON DELETE CASCADE UNIQUE,

  -- Analysis metadata
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',

  -- Extracted insights
  dialogue_summary TEXT,
  key_information TEXT[],
  troubleshooting_steps TEXT[],
  resolution_method TEXT,
  dialogue_quality NUMERIC(3,2), -- 0-1 score for dialogue quality

  -- Learning status
  proposals_generated INTEGER DEFAULT 0,
  proposals_auto_approved INTEGER DEFAULT 0,
  proposals_pending_review INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding analyses by thread
CREATE INDEX IF NOT EXISTS idx_resolution_analyses_thread ON resolution_analyses(thread_id);

-- Index for finding high-quality dialogues
CREATE INDEX IF NOT EXISTS idx_resolution_analyses_quality ON resolution_analyses(dialogue_quality);

-- ============================================
-- 4. Update learning_proposals source_type check
-- ============================================

-- Add check constraint for source_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_proposals_source_type_check'
  ) THEN
    ALTER TABLE learning_proposals ADD CONSTRAINT learning_proposals_source_type_check
      CHECK (source_type IN ('observation', 'resolution_analysis'));
  END IF;
END $$;
