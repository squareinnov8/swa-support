-- Migration: 036_pending_actions
-- Add pending_action column to threads table
-- Tracks what Lina is waiting for (vendor response, customer photos, etc.)

-- Add pending_action JSONB column
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS pending_action JSONB;

-- Add comment
COMMENT ON COLUMN threads.pending_action IS
  'Tracks what Lina is waiting for: { type, description, waitingFor, createdAt, metadata }';

-- Create GIN index for querying by pending action type
CREATE INDEX IF NOT EXISTS idx_threads_pending_action
  ON threads USING GIN (pending_action);

-- Create index for finding threads with any pending action
CREATE INDEX IF NOT EXISTS idx_threads_has_pending_action
  ON threads ((pending_action IS NOT NULL))
  WHERE pending_action IS NOT NULL;
