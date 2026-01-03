-- Vector Search Function for Semantic Retrieval
-- Uses pgvector's cosine distance operator for similarity search

-- Create the match function for KB chunks
CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  chunk_id uuid,
  doc_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id AS chunk_id,
    kc.doc_id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM kb_chunks kc
  JOIN kb_docs kd ON kd.id = kc.doc_id
  WHERE
    kc.embedding IS NOT NULL
    AND kd.evolution_status = 'published'
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION match_kb_chunks IS 'Semantic similarity search on KB chunks using cosine distance';

-- Create index for faster vector search (if not exists)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON kb_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
