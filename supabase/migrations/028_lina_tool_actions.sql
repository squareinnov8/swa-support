-- Migration: 028_lina_tool_actions
-- Description: Track Lina's tool actions from admin chat for audit and analytics
-- Date: 2026-01-19

-- Create table to track tool actions
CREATE TABLE IF NOT EXISTS lina_tool_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES admin_lina_conversations(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  result JSONB NOT NULL,
  admin_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_lina_tool_actions_thread ON lina_tool_actions(thread_id);
CREATE INDEX idx_lina_tool_actions_tool ON lina_tool_actions(tool_name);
CREATE INDEX idx_lina_tool_actions_created ON lina_tool_actions(created_at DESC);
CREATE INDEX idx_lina_tool_actions_admin ON lina_tool_actions(admin_email);

-- Add comment explaining the table
COMMENT ON TABLE lina_tool_actions IS 'Audit log of tool actions taken by Lina during admin chat sessions';
COMMENT ON COLUMN lina_tool_actions.tool_name IS 'Name of the tool executed (create_kb_article, update_instruction, draft_relay_response, note_feedback)';
COMMENT ON COLUMN lina_tool_actions.tool_input IS 'Input parameters passed to the tool';
COMMENT ON COLUMN lina_tool_actions.result IS 'Result of the tool execution including success status and any created resources';
