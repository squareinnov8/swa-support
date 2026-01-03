-- Draft Tracking Migration
-- Tracks LLM draft generation for audit and improvement

CREATE TABLE IF NOT EXISTS draft_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  intent TEXT NOT NULL,

  -- KB context used
  kb_docs_used UUID[],
  kb_chunks_used UUID[],

  -- LLM details
  llm_provider TEXT DEFAULT 'anthropic',
  llm_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  prompt_tokens INT,
  completion_tokens INT,

  -- Output
  raw_draft TEXT NOT NULL,
  final_draft TEXT,
  citations JSONB,

  -- Validation
  policy_gate_passed BOOLEAN,
  policy_violations TEXT[],

  -- Outcome tracking
  was_sent BOOLEAN DEFAULT false,
  was_edited BOOLEAN DEFAULT false,
  edit_distance INT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_draft_generations_thread ON draft_generations(thread_id);
CREATE INDEX IF NOT EXISTS idx_draft_generations_intent ON draft_generations(intent);
CREATE INDEX IF NOT EXISTS idx_draft_generations_created ON draft_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_draft_generations_policy ON draft_generations(policy_gate_passed);

-- Comments
COMMENT ON TABLE draft_generations IS 'Audit log of all LLM-generated drafts';
COMMENT ON COLUMN draft_generations.kb_docs_used IS 'Array of doc IDs used as context';
COMMENT ON COLUMN draft_generations.raw_draft IS 'Original LLM output before any modifications';
COMMENT ON COLUMN draft_generations.final_draft IS 'Draft after policy gate (null if blocked)';
COMMENT ON COLUMN draft_generations.citations IS 'JSON array of {doc_id, chunk_id, quote} citations';
COMMENT ON COLUMN draft_generations.edit_distance IS 'Characters changed before sending (if edited)';
