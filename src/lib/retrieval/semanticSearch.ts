/**
 * Semantic Search
 *
 * Vector similarity search using pgvector.
 * This is the second phase of hybrid retrieval.
 */

import { supabase } from "@/lib/db";
import { embedText, formatEmbeddingForPg, isEmbeddingConfigured } from "./embed";
import type { KBDoc, KBChunk } from "@/lib/kb/types";

/**
 * Semantic search result
 */
export type SemanticSearchResult = {
  doc: KBDoc;
  chunk: KBChunk;
  similarity: number;
};

/**
 * Sanitize query for safe use in SQL ILIKE patterns
 * Removes/escapes characters that break PostgREST queries
 */
function sanitizeQueryForSearch(query: string): string {
  // Remove HTML tags
  let clean = query.replace(/<[^>]*>/g, " ");
  // Remove special characters that break PostgREST or patterns
  clean = clean.replace(/[()%_\\'"<>]/g, " ");
  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, " ").trim();
  // Limit length
  return clean.slice(0, 100);
}

/**
 * Search chunks by semantic similarity to query
 * Uses pgvector's <=> operator (cosine distance)
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    minSimilarity?: number;
    vehicleTags?: string[];
    productTags?: string[];
  } = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 10, minSimilarity = 0.5, vehicleTags, productTags } = options;

  // Check if embedding is configured
  if (!isEmbeddingConfigured()) {
    console.warn("OpenAI API key not configured, skipping semantic search");
    return [];
  }

  // Generate embedding for query
  const queryEmbedding = await embedText(query);
  const embeddingStr = formatEmbeddingForPg(queryEmbedding);

  // Build the RPC call for vector search
  // Using cosine similarity: 1 - cosine_distance
  const { data, error } = await supabase.rpc("match_kb_chunks", {
    query_embedding: embeddingStr,
    match_threshold: minSimilarity,
    match_count: limit,
  });

  if (error) {
    // If the function doesn't exist yet, fall back to basic search
    if (error.message.includes("function") || error.message.includes("does not exist")) {
      console.warn("match_kb_chunks function not found, using fallback search");
      return fallbackSemanticSearch(query, { limit, vehicleTags, productTags });
    }
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Fetch full doc and chunk data
  const results: SemanticSearchResult[] = [];

  for (const match of data) {
    // Get chunk
    const { data: chunk } = await supabase
      .from("kb_chunks")
      .select("*")
      .eq("id", match.chunk_id)
      .single();

    if (!chunk) continue;

    // Get doc
    const { data: doc } = await supabase
      .from("kb_docs")
      .select("*")
      .eq("id", chunk.doc_id)
      .eq("evolution_status", "published")
      .single();

    if (!doc) continue;

    // Apply vehicle/product filters
    if (vehicleTags && vehicleTags.length > 0) {
      const hasVehicle =
        doc.vehicle_tags.some((t: string) => vehicleTags.includes(t)) ||
        doc.vehicle_tags.includes("All");
      if (!hasVehicle) continue;
    }

    if (productTags && productTags.length > 0) {
      const hasProduct =
        doc.product_tags.some((t: string) => productTags.includes(t)) ||
        doc.product_tags.includes("All Products");
      if (!hasProduct) continue;
    }

    results.push({
      doc,
      chunk,
      similarity: match.similarity,
    });
  }

  return results;
}

/**
 * Fallback search when pgvector function isn't available
 * Uses basic text matching instead
 */
async function fallbackSemanticSearch(
  query: string,
  options: {
    limit?: number;
    vehicleTags?: string[];
    productTags?: string[];
  } = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 10, vehicleTags, productTags } = options;

  // Sanitize query for safe text search
  const safeQuery = sanitizeQueryForSearch(query);
  if (safeQuery.length < 3) {
    return [];
  }

  // Simple text search on chunks
  let queryBuilder = supabase
    .from("kb_chunks")
    .select(
      `
      *,
      doc:kb_docs(*)
    `
    )
    .ilike("content", `%${safeQuery}%`)
    .limit(limit);

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Fallback search failed: ${error.message}`);
  }

  if (!data) return [];

  const results: SemanticSearchResult[] = [];

  for (const row of data) {
    const doc = row.doc as KBDoc | null;
    if (!doc || doc.evolution_status !== "published") continue;

    // Apply vehicle/product filters
    if (vehicleTags && vehicleTags.length > 0) {
      const hasVehicle =
        doc.vehicle_tags.some((t) => vehicleTags.includes(t)) || doc.vehicle_tags.includes("All");
      if (!hasVehicle) continue;
    }

    if (productTags && productTags.length > 0) {
      const hasProduct =
        doc.product_tags.some((t) => productTags.includes(t)) ||
        doc.product_tags.includes("All Products");
      if (!hasProduct) continue;
    }

    results.push({
      doc,
      chunk: {
        id: row.id,
        doc_id: row.doc_id,
        chunk_index: row.chunk_index,
        content: row.content,
        embedding: row.embedding,
        created_at: row.created_at,
      },
      similarity: 0.7, // Fixed similarity for text matches
    });
  }

  return results;
}

/**
 * Search documents (not chunks) by title/body text
 * Useful when we want doc-level results
 */
export async function searchDocsByText(
  query: string,
  options: {
    limit?: number;
    vehicleTags?: string[];
    productTags?: string[];
  } = {}
): Promise<{ doc: KBDoc; score: number }[]> {
  const { limit = 10, vehicleTags, productTags } = options;

  // Sanitize query to prevent SQL injection and pattern errors
  const safeQuery = sanitizeQueryForSearch(query);

  // If query is too short after sanitization, return empty
  if (safeQuery.length < 3) {
    return [];
  }

  let queryBuilder = supabase
    .from("kb_docs")
    .select("*")
    .eq("evolution_status", "published")
    .or(`title.ilike.%${safeQuery}%,body.ilike.%${safeQuery}%`)
    .limit(limit);

  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`Doc text search failed: ${error.message}`);
  }

  if (!data) return [];

  let results = data.map((doc) => ({
    doc,
    score: doc.title.toLowerCase().includes(query.toLowerCase()) ? 0.9 : 0.7,
  }));

  // Apply filters
  if (vehicleTags && vehicleTags.length > 0) {
    results = results.filter(
      (r) =>
        r.doc.vehicle_tags.some((t) => vehicleTags.includes(t)) ||
        r.doc.vehicle_tags.includes("All")
    );
  }

  if (productTags && productTags.length > 0) {
    results = results.filter(
      (r) =>
        r.doc.product_tags.some((t) => productTags.includes(t)) ||
        r.doc.product_tags.includes("All Products")
    );
  }

  return results.sort((a, b) => b.score - a.score);
}
