-- Migration: Reel Topic Recommendations
-- Adds functions for analyzing trending support topics to inform content creation

-- Function to get trending intents (comparing recent vs baseline)
CREATE OR REPLACE FUNCTION get_trending_intents(
  recent_days INTEGER DEFAULT 7,
  baseline_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  intent_slug TEXT,
  intent_name TEXT,
  intent_category TEXT,
  recent_count BIGINT,
  baseline_count BIGINT,
  trend_score NUMERIC,
  avg_confidence NUMERIC,
  sample_subjects TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_intents AS (
    SELECT
      i.slug,
      i.name,
      i.category,
      COUNT(ti.thread_id) as count,
      AVG(ti.confidence) as avg_conf,
      ARRAY_AGG(DISTINCT t.subject ORDER BY t.subject) FILTER (WHERE t.subject IS NOT NULL) as subjects
    FROM thread_intents ti
    JOIN intents i ON i.id = ti.intent_id
    JOIN threads t ON t.id = ti.thread_id
    WHERE ti.detected_at > NOW() - (recent_days || ' days')::INTERVAL
      AND i.slug NOT IN ('VENDOR_SPAM', 'THANK_YOU_CLOSE', 'FOLLOW_UP_NO_NEW_INFO', 'UNKNOWN')
    GROUP BY i.slug, i.name, i.category
  ),
  baseline_intents AS (
    SELECT
      i.slug,
      COUNT(ti.thread_id) as count
    FROM thread_intents ti
    JOIN intents i ON i.id = ti.intent_id
    WHERE ti.detected_at > NOW() - (baseline_days || ' days')::INTERVAL
      AND ti.detected_at <= NOW() - (recent_days || ' days')::INTERVAL
      AND i.slug NOT IN ('VENDOR_SPAM', 'THANK_YOU_CLOSE', 'FOLLOW_UP_NO_NEW_INFO', 'UNKNOWN')
    GROUP BY i.slug
  )
  SELECT
    r.slug,
    r.name,
    r.category,
    r.count as recent_count,
    COALESCE(b.count, 0) as baseline_count,
    CASE
      WHEN COALESCE(b.count, 0) = 0 THEN r.count::NUMERIC * 2  -- New topics get 2x boost
      ELSE (r.count::NUMERIC / GREATEST(b.count::NUMERIC * recent_days::NUMERIC / (baseline_days - recent_days), 1))
    END as trend_score,
    r.avg_conf,
    r.subjects[1:5]  -- Top 5 sample subjects
  FROM recent_intents r
  LEFT JOIN baseline_intents b ON b.slug = r.slug
  WHERE r.count >= 2  -- Minimum threshold
  ORDER BY trend_score DESC, recent_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to get high-quality resolved conversations (good for storytelling)
CREATE OR REPLACE FUNCTION get_quality_resolutions(
  days_back INTEGER DEFAULT 30,
  min_quality NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  thread_id UUID,
  subject TEXT,
  intent_slug TEXT,
  dialogue_summary TEXT,
  key_information TEXT[],
  troubleshooting_steps TEXT[],
  resolution_method TEXT,
  quality_score NUMERIC,
  resolved_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ra.thread_id,
    t.subject,
    t.last_intent,
    ra.dialogue_summary,
    ra.key_information,
    ra.troubleshooting_steps,
    ra.resolution_method,
    ra.dialogue_quality,
    t.archived_at
  FROM resolution_analyses ra
  JOIN threads t ON t.id = ra.thread_id
  WHERE ra.created_at > NOW() - (days_back || ' days')::INTERVAL
    AND ra.dialogue_quality >= min_quality
    AND ra.dialogue_summary IS NOT NULL
  ORDER BY ra.dialogue_quality DESC, ra.created_at DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Function to get frequently mentioned products/vehicles
CREATE OR REPLACE FUNCTION get_popular_product_topics(
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  product_id UUID,
  product_title TEXT,
  product_type TEXT,
  mention_count BIGINT,
  common_intents TEXT[],
  sample_questions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH product_threads AS (
    -- Extract product mentions from thread events
    SELECT
      (e.payload->>'product_id')::UUID as pid,
      e.thread_id,
      t.subject,
      t.last_intent
    FROM events e
    JOIN threads t ON t.id = e.thread_id
    WHERE e.event_type IN ('product_recommended', 'fitment_lookup', 'catalog_lookup')
      AND e.created_at > NOW() - (days_back || ' days')::INTERVAL
      AND e.payload->>'product_id' IS NOT NULL
  )
  SELECT
    p.id,
    p.title,
    p.product_type,
    COUNT(DISTINCT pt.thread_id) as mention_count,
    ARRAY_AGG(DISTINCT pt.last_intent) FILTER (WHERE pt.last_intent IS NOT NULL) as common_intents,
    ARRAY_AGG(DISTINCT pt.subject)[1:5] as sample_questions
  FROM product_threads pt
  JOIN products p ON p.id = pt.pid
  GROUP BY p.id, p.title, p.product_type
  ORDER BY mention_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Table to store reel topic recommendations for caching and review
CREATE TABLE IF NOT EXISTS reel_topic_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_type TEXT NOT NULL CHECK (topic_type IN ('trending_intent', 'quality_resolution', 'product_highlight', 'external_trend')),
  title TEXT NOT NULL,
  description TEXT,
  hook_ideas TEXT[],
  source_data JSONB,
  relevance_score NUMERIC DEFAULT 0.5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'skipped')),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  notes TEXT
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_reel_topics_status ON reel_topic_recommendations(status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_topics_type ON reel_topic_recommendations(topic_type);

-- Comment
COMMENT ON TABLE reel_topic_recommendations IS 'AI-generated content topic recommendations based on support data and trends';
