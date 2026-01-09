-- Intent Management System
-- Supports dynamic intents managed via admin UI and multi-intent per thread

-- Create intents table for dynamic intent management
CREATE TABLE IF NOT EXISTS intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,           -- e.g., "PRODUCT_SUPPORT", "ORDER_STATUS"
  name text NOT NULL,                   -- Human-readable name
  description text,                     -- Detailed description for LLM context
  category text NOT NULL DEFAULT 'general',  -- For grouping: support, order, escalation, etc.
  priority int NOT NULL DEFAULT 0,      -- Higher = more important (escalations = 100)
  examples text[],                      -- Example phrases/patterns for this intent
  is_active boolean NOT NULL DEFAULT true,
  requires_verification boolean NOT NULL DEFAULT false,  -- Needs customer/order verification
  auto_escalate boolean NOT NULL DEFAULT false,          -- Auto-escalate to human
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create thread_intents junction table for multi-intent support
CREATE TABLE IF NOT EXISTS thread_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  intent_id uuid NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  confidence numeric(3,2) DEFAULT 0.5,  -- 0.00 to 1.00
  detected_at timestamptz DEFAULT now(),
  detected_from_message_id uuid REFERENCES messages(id),
  is_resolved boolean NOT NULL DEFAULT false,  -- Intent has been addressed
  resolved_at timestamptz,
  UNIQUE(thread_id, intent_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_intents_slug ON intents(slug);
CREATE INDEX IF NOT EXISTS idx_intents_category ON intents(category);
CREATE INDEX IF NOT EXISTS idx_intents_active ON intents(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_thread_intents_thread ON thread_intents(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_intents_intent ON thread_intents(intent_id);
CREATE INDEX IF NOT EXISTS idx_thread_intents_unresolved ON thread_intents(thread_id) WHERE is_resolved = false;

-- Seed initial intents from existing taxonomy
INSERT INTO intents (slug, name, description, category, priority, examples, requires_verification, auto_escalate) VALUES
  -- Customer Support - Product Issues
  ('PRODUCT_SUPPORT', 'Product Support', 'General product troubleshooting - screen dead, audio issues, not working', 'support', 10,
   ARRAY['screen is dead', 'audio not working', 'stopped working', 'broken', 'malfunction', 'not turning on'],
   false, false),

  ('FIRMWARE_UPDATE_REQUEST', 'Firmware Update Request', 'Customer requesting firmware files or access to download firmware', 'support', 10,
   ARRAY['need firmware', 'send firmware', 'firmware download', 'latest firmware', 'software update'],
   false, false),

  ('FIRMWARE_ACCESS_ISSUE', 'Firmware Access Issue', 'Problems accessing or downloading firmware from portal', 'support', 15,
   ARRAY['cant login', 'access denied', '403 error', 'password not working', 'kicking me off'],
   false, false),

  ('DOCS_VIDEO_MISMATCH', 'Documentation Mismatch', 'Install docs or videos dont match actual product', 'support', 10,
   ARRAY['video shows different', 'instructions wrong', 'docs dont match', 'tutorial different'],
   false, false),

  ('INSTALL_GUIDANCE', 'Installation Guidance', 'How-to install questions and step-by-step help', 'support', 5,
   ARRAY['how to install', 'installation guide', 'step by step', 'walk me through'],
   false, false),

  ('FUNCTIONALITY_BUG', 'Functionality Bug', 'Product feature not working as expected', 'support', 15,
   ARRAY['supposed to', 'should be able to', 'feature not working', 'button doesnt work'],
   false, false),

  ('COMPATIBILITY_QUESTION', 'Compatibility Question', 'Will product X work with my car? Pre-purchase questions', 'presale', 5,
   ARRAY['compatible with', 'will it fit', 'work with my car', 'before I buy'],
   false, false),

  ('PART_IDENTIFICATION', 'Part Identification', 'Customer asking what part they need or have', 'presale', 5,
   ARRAY['what part', 'which part', 'part number', 'identify this'],
   false, false),

  -- Order Related
  ('ORDER_STATUS', 'Order Status', 'Where is my order? Tracking questions', 'order', 20,
   ARRAY['where is my order', 'tracking number', 'has it shipped', 'when will it arrive', 'order status'],
   true, false),

  ('ORDER_CHANGE_REQUEST', 'Order Change Request', 'Cancel or modify order, change shipping address', 'order', 25,
   ARRAY['cancel order', 'change order', 'modify order', 'different address', 'wrong address'],
   true, false),

  ('MISSING_DAMAGED_ITEM', 'Missing/Damaged Item', 'Item missing from order or arrived damaged', 'order', 30,
   ARRAY['missing item', 'arrived damaged', 'box crushed', 'broken on arrival', 'parts missing'],
   true, false),

  ('WRONG_ITEM_RECEIVED', 'Wrong Item Received', 'Customer received incorrect product', 'order', 30,
   ARRAY['wrong item', 'incorrect item', 'not what I ordered', 'sent wrong product'],
   true, false),

  ('RETURN_REFUND_REQUEST', 'Return/Refund Request', 'Customer wants to return product or get refund', 'order', 25,
   ARRAY['return', 'refund', 'money back', 'RMA', 'send it back'],
   true, false),

  -- Escalation Triggers
  ('CHARGEBACK_THREAT', 'Chargeback Threat', 'Customer threatening chargeback or payment dispute', 'escalation', 100,
   ARRAY['chargeback', 'dispute charge', 'BBB', 'credit card company', 'paypal dispute', 'contact bank'],
   true, true),

  ('LEGAL_SAFETY_RISK', 'Legal/Safety Risk', 'Legal threats or genuine safety concerns', 'escalation', 100,
   ARRAY['lawyer', 'attorney', 'legal action', 'lawsuit', 'fire risk', 'safety hazard', 'burning smell'],
   false, true),

  -- Low Priority / No Action
  ('THANK_YOU_CLOSE', 'Thank You / Close', 'Customer saying thanks, closing thread', 'closing', 0,
   ARRAY['thank you', 'thanks so much', 'appreciate help', 'problem solved', 'works now'],
   false, false),

  ('FOLLOW_UP_NO_NEW_INFO', 'Follow-up (No New Info)', 'Follow-up with no new information', 'closing', 0,
   ARRAY['any update', 'still waiting', 'just checking', 'following up', 'havent heard back'],
   false, false),

  -- Non-Customer
  ('VENDOR_SPAM', 'Vendor/Spam', 'Sales pitches, partnerships, vendor inquiries', 'spam', -10,
   ARRAY['partnership opportunity', 'SEO services', 'marketing services', 'guest post', 'B2B'],
   false, false),

  -- Unknown
  ('UNKNOWN', 'Unknown Intent', 'Intent could not be determined - requires human review', 'unknown', 0,
   ARRAY[],
   false, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  examples = EXCLUDED.examples,
  requires_verification = EXCLUDED.requires_verification,
  auto_escalate = EXCLUDED.auto_escalate,
  updated_at = now();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_intent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for intents table
DROP TRIGGER IF EXISTS intents_updated_at ON intents;
CREATE TRIGGER intents_updated_at
  BEFORE UPDATE ON intents
  FOR EACH ROW
  EXECUTE FUNCTION update_intent_timestamp();

-- View for thread intents with intent details
CREATE OR REPLACE VIEW thread_intents_view AS
SELECT
  ti.id,
  ti.thread_id,
  ti.intent_id,
  i.slug,
  i.name,
  i.category,
  i.priority,
  ti.confidence,
  ti.detected_at,
  ti.is_resolved,
  ti.resolved_at
FROM thread_intents ti
JOIN intents i ON i.id = ti.intent_id
ORDER BY i.priority DESC, ti.detected_at DESC;

-- Function to add intent to thread (handles duplicates gracefully)
CREATE OR REPLACE FUNCTION add_thread_intent(
  p_thread_id uuid,
  p_intent_slug text,
  p_confidence numeric DEFAULT 0.5,
  p_message_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_intent_id uuid;
  v_thread_intent_id uuid;
BEGIN
  -- Get intent ID
  SELECT id INTO v_intent_id FROM intents WHERE slug = p_intent_slug AND is_active = true;
  IF v_intent_id IS NULL THEN
    RAISE EXCEPTION 'Intent not found: %', p_intent_slug;
  END IF;

  -- Insert or update thread_intent
  INSERT INTO thread_intents (thread_id, intent_id, confidence, detected_from_message_id)
  VALUES (p_thread_id, v_intent_id, p_confidence, p_message_id)
  ON CONFLICT (thread_id, intent_id)
  DO UPDATE SET
    confidence = GREATEST(thread_intents.confidence, p_confidence),
    detected_from_message_id = COALESCE(p_message_id, thread_intents.detected_from_message_id)
  RETURNING id INTO v_thread_intent_id;

  -- If adding a known intent, remove UNKNOWN
  IF p_intent_slug != 'UNKNOWN' THEN
    DELETE FROM thread_intents
    WHERE thread_id = p_thread_id
    AND intent_id = (SELECT id FROM intents WHERE slug = 'UNKNOWN');
  END IF;

  -- Update thread's last_intent to highest priority unresolved intent
  UPDATE threads SET
    last_intent = (
      SELECT i.slug
      FROM thread_intents ti
      JOIN intents i ON i.id = ti.intent_id
      WHERE ti.thread_id = p_thread_id AND ti.is_resolved = false
      ORDER BY i.priority DESC, ti.detected_at DESC
      LIMIT 1
    ),
    updated_at = now()
  WHERE id = p_thread_id;

  RETURN v_thread_intent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve an intent on a thread
CREATE OR REPLACE FUNCTION resolve_thread_intent(
  p_thread_id uuid,
  p_intent_slug text
) RETURNS boolean AS $$
BEGIN
  UPDATE thread_intents
  SET is_resolved = true, resolved_at = now()
  WHERE thread_id = p_thread_id
  AND intent_id = (SELECT id FROM intents WHERE slug = p_intent_slug);

  -- Update thread's last_intent to next highest priority unresolved intent
  UPDATE threads SET
    last_intent = (
      SELECT i.slug
      FROM thread_intents ti
      JOIN intents i ON i.id = ti.intent_id
      WHERE ti.thread_id = p_thread_id AND ti.is_resolved = false
      ORDER BY i.priority DESC, ti.detected_at DESC
      LIMIT 1
    ),
    updated_at = now()
  WHERE id = p_thread_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing thread intents to new system
INSERT INTO thread_intents (thread_id, intent_id, confidence, detected_at)
SELECT
  t.id,
  i.id,
  0.8,
  t.created_at
FROM threads t
JOIN intents i ON i.slug = t.last_intent
WHERE t.last_intent IS NOT NULL
ON CONFLICT (thread_id, intent_id) DO NOTHING;
