-- KB Enhancement Migration
-- Adds hierarchical categories, tagging, and tracking for knowledge base

-- Hierarchical categories (topic-centric)
CREATE TABLE IF NOT EXISTS kb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES kb_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enhance kb_docs with category, tags, and evolution tracking
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES kb_categories(id);
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS vehicle_tags TEXT[] DEFAULT '{}';
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS product_tags TEXT[] DEFAULT '{}';
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS intent_tags TEXT[] DEFAULT '{}';
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS source_thread_id UUID REFERENCES threads(id);
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS evolution_status TEXT DEFAULT 'published';
ALTER TABLE kb_docs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Intent tagging with confidence (many-to-many relationship)
CREATE TABLE IF NOT EXISTS kb_doc_intents (
  doc_id UUID REFERENCES kb_docs(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (doc_id, intent)
);

-- Track KB usage for resolution (which docs helped resolve which threads)
CREATE TABLE IF NOT EXISTS kb_resolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
  doc_ids UUID[] NOT NULL,
  chunk_ids UUID[],
  retrieval_method TEXT NOT NULL,
  was_helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content gaps (when no KB match found for a query)
CREATE TABLE IF NOT EXISTS kb_content_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent TEXT NOT NULL,
  thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  gap_type TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  addressed_by_doc_id UUID REFERENCES kb_docs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_kb_categories_parent ON kb_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories(slug);
CREATE INDEX IF NOT EXISTS idx_kb_docs_category ON kb_docs(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_vehicle_tags ON kb_docs USING GIN(vehicle_tags);
CREATE INDEX IF NOT EXISTS idx_kb_docs_product_tags ON kb_docs USING GIN(product_tags);
CREATE INDEX IF NOT EXISTS idx_kb_docs_intent_tags ON kb_docs USING GIN(intent_tags);
CREATE INDEX IF NOT EXISTS idx_kb_docs_evolution_status ON kb_docs(evolution_status);
CREATE INDEX IF NOT EXISTS idx_kb_doc_intents_intent ON kb_doc_intents(intent);
CREATE INDEX IF NOT EXISTS idx_kb_resolution_log_thread ON kb_resolution_log(thread_id);
CREATE INDEX IF NOT EXISTS idx_kb_content_gaps_intent ON kb_content_gaps(intent);
CREATE INDEX IF NOT EXISTS idx_kb_content_gaps_status ON kb_content_gaps(status);

-- Comments for documentation
COMMENT ON TABLE kb_categories IS 'Hierarchical category structure for organizing KB docs (topic-centric)';
COMMENT ON COLUMN kb_docs.vehicle_tags IS 'Vehicle variants this doc applies to (e.g., Infiniti Q50, Nissan 370Z)';
COMMENT ON COLUMN kb_docs.product_tags IS 'Products this doc applies to (e.g., APEX, other products)';
COMMENT ON COLUMN kb_docs.intent_tags IS 'Intents this doc helps resolve (e.g., FIRMWARE_UPDATE_REQUEST)';
COMMENT ON COLUMN kb_docs.evolution_status IS 'Status: published, proposed, approved, rejected';
COMMENT ON TABLE kb_doc_intents IS 'Many-to-many mapping of docs to intents with confidence scores';
COMMENT ON TABLE kb_resolution_log IS 'Tracks which KB docs were used to resolve each thread';
COMMENT ON TABLE kb_content_gaps IS 'Tracks queries where no adequate KB match was found';
