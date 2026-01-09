-- Migration: Admin-Lina Chat Persistence
-- Stores conversations between admins and Lina for each thread

-- Admin conversations with Lina (one per thread per admin)
CREATE TABLE IF NOT EXISTS admin_lina_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
  admin_user TEXT NOT NULL DEFAULT 'admin',
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual messages in admin-Lina conversations
CREATE TABLE IF NOT EXISTS admin_lina_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES admin_lina_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'lina')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_admin_lina_messages_conversation
  ON admin_lina_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_lina_conversations_thread
  ON admin_lina_conversations(thread_id);

-- Unique constraint: one conversation per thread per admin
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_lina_conv_thread_admin
  ON admin_lina_conversations(thread_id, admin_user);

-- Trigger to update updated_at on conversation when messages are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE admin_lina_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_lina_message_update_conversation
  AFTER INSERT ON admin_lina_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
