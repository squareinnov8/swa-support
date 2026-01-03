-- KB Import Pipeline Tables
-- Supports one-time import from Notion and Gmail with LLM-assisted categorization

-- Track import jobs (batch operations)
CREATE TABLE kb_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'notion', 'gmail'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  total_items INT DEFAULT 0,
  processed_items INT DEFAULT 0,
  approved_items INT DEFAULT 0,
  rejected_items INT DEFAULT 0,
  error_message TEXT,
  config JSONB DEFAULT '{}', -- source-specific config (e.g., Notion workspace, Gmail labels)
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staging table for proposed KB docs (review before publish)
CREATE TABLE kb_proposed_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID REFERENCES kb_import_jobs(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'notion', 'gmail'
  source_id TEXT, -- Notion page ID or Gmail thread ID
  source_url TEXT, -- Link to original content

  -- Proposed content
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- LLM-suggested categorization
  suggested_category_id UUID REFERENCES kb_categories(id),
  suggested_intent_tags TEXT[] DEFAULT '{}',
  suggested_vehicle_tags TEXT[] DEFAULT '{}',
  suggested_product_tags TEXT[] DEFAULT '{}',

  -- Confidence scoring
  categorization_confidence REAL DEFAULT 0,
  content_quality_score REAL DEFAULT 0,

  -- LLM analysis details
  llm_analysis JSONB, -- Full LLM response for debugging

  -- Review status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, needs_edit
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,

  -- If approved, link to published doc
  published_doc_id UUID REFERENCES kb_docs(id),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gmail thread candidates for manual selection before processing
CREATE TABLE gmail_thread_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID REFERENCES kb_import_jobs(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL, -- Gmail thread ID
  subject TEXT,
  snippet TEXT, -- First 200 chars preview
  message_count INT,
  labels TEXT[], -- Gmail labels (e.g., 'resolved', 'important')
  last_message_date TIMESTAMPTZ,
  participants TEXT[], -- Email addresses involved

  -- Selection status
  selected BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(import_job_id, thread_id)
);

-- Indexes for performance
CREATE INDEX idx_kb_import_jobs_status ON kb_import_jobs(status);
CREATE INDEX idx_kb_import_jobs_source ON kb_import_jobs(source);
CREATE INDEX idx_kb_proposed_docs_status ON kb_proposed_docs(status);
CREATE INDEX idx_kb_proposed_docs_job ON kb_proposed_docs(import_job_id);
CREATE INDEX idx_kb_proposed_docs_confidence ON kb_proposed_docs(categorization_confidence);
CREATE INDEX idx_gmail_candidates_job ON gmail_thread_candidates(import_job_id);
CREATE INDEX idx_gmail_candidates_selected ON gmail_thread_candidates(selected) WHERE selected = true;
CREATE INDEX idx_gmail_candidates_processed ON gmail_thread_candidates(processed) WHERE processed = false;

-- Comments
COMMENT ON TABLE kb_import_jobs IS 'Tracks batch import operations from external sources';
COMMENT ON TABLE kb_proposed_docs IS 'Staging area for KB docs awaiting review before publishing';
COMMENT ON TABLE gmail_thread_candidates IS 'Gmail threads available for selection before import processing';
COMMENT ON COLUMN kb_proposed_docs.categorization_confidence IS 'Combined confidence score (0-1), auto-approve threshold is 0.85';
COMMENT ON COLUMN kb_proposed_docs.content_quality_score IS 'LLM-assessed quality score (0-1), flags low-quality content';
