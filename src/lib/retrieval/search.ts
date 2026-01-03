/**
 * Hybrid Search Orchestrator
 *
 * Combines intent-based lookup and semantic search for optimal retrieval.
 * Strategy:
 * 1. Intent-based lookup (deterministic, high precision)
 * 2. Semantic search (fuzzy, high recall)
 * 3. Merge and score results
 */

import type { Intent } from "@/lib/intents/taxonomy";
import type { KBDoc, KBChunk } from "@/lib/kb/types";
import { lookupByIntent, filterByVehicle, filterByProduct } from "./intentLookup";
import { semanticSearch, searchDocsByText } from "./semanticSearch";

/**
 * Unified search result
 */
export type SearchResult = {
  doc: KBDoc;
  chunk?: KBChunk;
  score: number;
  sources: ("intent" | "semantic" | "text")[];
};

/**
 * Search context from the query
 */
export type SearchContext = {
  intent?: Intent;
  query: string;
  vehicleTag?: string;
  productTag?: string;
};

/**
 * Search options
 */
export type SearchOptions = {
  /** Maximum results to return */
  limit?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Whether to use semantic search */
  useSemantic?: boolean;
  /** Whether to use text search as fallback */
  useTextFallback?: boolean;
};

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  limit: 5,
  minScore: 0.3,
  useSemantic: true,
  useTextFallback: true,
};

/**
 * Hybrid search - main entry point
 *
 * Performs a multi-strategy search:
 * 1. If intent is provided, does intent-based lookup first
 * 2. Then performs semantic search on the query
 * 3. Merges results with score boosting for multiple matches
 */
export async function hybridSearch(
  context: SearchContext,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const resultMap = new Map<string, SearchResult>();

  // 1. Intent-based lookup (if intent provided)
  if (context.intent) {
    try {
      let intentResults = await lookupByIntent(context.intent);

      // Apply filters
      if (context.vehicleTag) {
        intentResults = filterByVehicle(intentResults, context.vehicleTag);
      }
      if (context.productTag) {
        intentResults = filterByProduct(intentResults, context.productTag);
      }

      for (const result of intentResults) {
        resultMap.set(result.doc.id, {
          doc: result.doc,
          score: result.score * 0.6, // Intent match weight: 60%
          sources: ["intent"],
        });
      }
    } catch (err) {
      console.warn("Intent lookup failed:", err);
    }
  }

  // 2. Semantic search (if enabled and query provided)
  if (opts.useSemantic && context.query) {
    try {
      const semanticResults = await semanticSearch(context.query, {
        limit: opts.limit * 2, // Get more for merging
        minSimilarity: opts.minScore,
        vehicleTags: context.vehicleTag ? [context.vehicleTag] : undefined,
        productTags: context.productTag ? [context.productTag] : undefined,
      });

      for (const result of semanticResults) {
        const existing = resultMap.get(result.doc.id);

        if (existing) {
          // Boost score for docs found by multiple strategies
          existing.score += result.similarity * 0.3; // Semantic weight: 30%
          existing.sources.push("semantic");
          if (result.chunk) {
            existing.chunk = result.chunk; // Prefer chunk from semantic search
          }
        } else {
          resultMap.set(result.doc.id, {
            doc: result.doc,
            chunk: result.chunk,
            score: result.similarity * 0.4, // Lower base score for semantic-only
            sources: ["semantic"],
          });
        }
      }
    } catch (err) {
      console.warn("Semantic search failed:", err);
    }
  }

  // 3. Text search fallback (if enabled and few results)
  if (opts.useTextFallback && resultMap.size < opts.limit && context.query) {
    try {
      const textResults = await searchDocsByText(context.query, {
        limit: opts.limit,
        vehicleTags: context.vehicleTag ? [context.vehicleTag] : undefined,
        productTags: context.productTag ? [context.productTag] : undefined,
      });

      for (const result of textResults) {
        const existing = resultMap.get(result.doc.id);

        if (existing) {
          existing.score += result.score * 0.1; // Small boost
          existing.sources.push("text");
        } else {
          resultMap.set(result.doc.id, {
            doc: result.doc,
            score: result.score * 0.3, // Low base score for text-only
            sources: ["text"],
          });
        }
      }
    } catch (err) {
      console.warn("Text search failed:", err);
    }
  }

  // Convert to array, filter by min score, sort by score
  let results = Array.from(resultMap.values())
    .filter((r) => r.score >= opts.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);

  // Normalize scores to 0-1 range
  const maxScore = results[0]?.score ?? 1;
  if (maxScore > 1) {
    results = results.map((r) => ({
      ...r,
      score: r.score / maxScore,
    }));
  }

  return results;
}

/**
 * Simple search by query text only (no intent)
 */
export async function searchByQuery(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  return hybridSearch({ query }, options);
}

/**
 * Search by intent only (no query text)
 */
export async function searchByIntent(
  intent: Intent,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  return hybridSearch({ intent, query: "" }, { ...options, useSemantic: false });
}

/**
 * Get best match for a query
 */
export async function getBestMatch(
  context: SearchContext
): Promise<SearchResult | null> {
  const results = await hybridSearch(context, { limit: 1 });
  return results[0] ?? null;
}

/**
 * Check if any relevant KB content exists for a context
 */
export async function hasRelevantContent(context: SearchContext): Promise<boolean> {
  const results = await hybridSearch(context, { limit: 1, minScore: 0.5 });
  return results.length > 0;
}

/**
 * Get suggested content for a context (lower threshold)
 */
export async function getSuggestedContent(
  context: SearchContext,
  limit: number = 3
): Promise<SearchResult[]> {
  return hybridSearch(context, { limit, minScore: 0.2 });
}
